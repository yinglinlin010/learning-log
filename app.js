// ====================================================================
// 雲端即時投票系統 (W10 × W11 高級版)
// 結合 Supabase Auth 身分驗證、關聯式資料庫與 RLS 安全門禁
// ====================================================================

(function () {
  "use strict";

  var cfg = window.APP_CONFIG || {};

  // DOM 快速選取
  var $ = function (id) { return document.getElementById(id); };
  var els = {
    configWarning: $("config-warning"),
    configMessage: $("config-message"),
    authStatusBar: $("auth-status-bar"),
    authPanel: $("auth-panel"),
    authForm: $("auth-form"),
    authEmail: $("auth-email"),
    authPassword: $("auth-password"),
    closeAuthBtn: $("close-auth-btn"),
    submitSignup: $("submit-signup"),
    createPollPanel: $("create-poll-panel"),
    createPollForm: $("create-poll-form"),
    newPollTitle: $("new-poll-title"),
    newPollDesc: $("new-poll-desc"),
    optionsInputs: $("options-inputs"),
    addMoreOptBtn: $("add-more-opt-btn"),
    cancelCreateBtn: $("cancel-create-btn"),
    toggleCreateBtn: $("toggle-create-btn"),
    pollsContainer: $("polls-container"),
    systemStatus: $("system-status"),
    tabAll: document.querySelector('.tab-btn[data-filter="all"]'),
    tabMyVotes: $("tab-my-votes")
  };

  var client = null;
  var currentUser = null;
  var currentFilter = "all";
  var statusTimeout = null;

  // ---------- 浮動提示 Toast ----------
  function notify(msg, kind) {
    if (!msg) return;
    if (statusTimeout) clearTimeout(statusTimeout);
    els.systemStatus.textContent = msg;
    els.systemStatus.dataset.kind = kind || "info";
    els.systemStatus.classList.add("visible");
    statusTimeout = setTimeout(function () {
      els.systemStatus.classList.remove("visible");
    }, 3800);
  }

  // ---------- 設定檔防呆檢查 ----------
  function cleanUrl(url) {
    return String(url || "").trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  }

  function isSecretKey(key) {
    if (key.indexOf("sb_secret_") === 0) return true;
    var parts = key.split(".");
    if (parts.length !== 3) return false;
    try {
      var payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      return payload.role === "service_role";
    } catch (e) {
      return false;
    }
  }

  function checkConfig() {
    var url = cleanUrl(cfg.SUPABASE_URL);
    var key = String(cfg.SUPABASE_KEY || "").trim();
    if (!url || url.indexOf("貼上") === 0) return "SUPABASE_URL 仍為預設佔位文字，尚未填入您的 Project URL。";
    if (url.indexOf("supabase.com/dashboard") !== -1) return "SUPABASE_URL 誤填為管理後台網址。請使用 Project URL（格式為 https://xxxx.supabase.co）。";
    if (!/^https?:\/\/[^\s]+$/.test(url)) return "SUPABASE_URL 格式不正確，必須以 https:// 開頭。";
    if (!key || key.indexOf("貼上") === 0) return "SUPABASE_KEY 仍為預設佔位文字，尚未填入您的 Publishable key。";
    if (isSecretKey(key)) return "SECRET";
    return "";
  }

  // ---------- 錯誤訊息白話解析 ----------
  function explain(err) {
    if (!err) return "";
    var code = err.code || "";
    var msg = String(err.message || err);
    var byCode = {
      invalid_credentials: "Email 或密碼錯誤。若為首次使用，請點選「註冊新帳號」。",
      email_not_confirmed: "此帳號尚未完成信箱確認。請至 Supabase Authentication 關閉 Confirm email 開關。",
      user_already_exists: "此 Email 已經註冊過，請直接輸入密碼點擊「登入」。",
      weak_password: "密碼強度不足，長度請至少填寫 6 碼。",
      over_email_send_rate_limit: "Supabase 寄信額度已達上限。請至後台關閉 Confirm email。",
      signup_disabled: "目前已關閉新使用者註冊。",
      email_address_invalid: "Email 格式無效，請使用真實且格式正確之電子信箱。"
    };
    if (byCode[code]) return byCode[code];
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "無法連線至 Supabase：請檢查網路狀態或確認 Project URL 是否正確。";
    if (/Invalid API key|No API key|apikey/i.test(msg)) return "金鑰驗證失敗：請檢查 config.js 內的 Publishable key 是否完整正確。";
    if (code === "PGRST205" || /relation .* does not exist/i.test(msg)) return "找不到投票資料表：請先至 Supabase SQL Editor 執行 schema.sql 腳本。";
    if (code === "23505" || /unique_vote_per_user_per_poll/i.test(msg)) return "每人限投一票：門禁系統阻擋了重複投票。若要更換選擇，請先撤回現有選票。";
    if (code === "42501" || /row-level security policy/i.test(msg)) return "安全性門禁（RLS）拒絕此項操作：請確認 schema.sql 規則是否已正確跑過。";
    return msg;
  }

  // ---------- 頂部狀態列與登入狀態渲染 ----------
  function renderAuthBar() {
    els.authStatusBar.replaceChildren();
    if (currentUser) {
      var badge = document.createElement("span");
      badge.className = "user-email-badge";
      badge.textContent = currentUser.email || "已登入";

      var logoutBtn = document.createElement("button");
      logoutBtn.type = "button";
      logoutBtn.className = "secondary btn-sm";
      logoutBtn.textContent = "登出";
      logoutBtn.addEventListener("click", handleSignOut);

      els.authStatusBar.append(badge, logoutBtn);
      els.toggleCreateBtn.hidden = false;
      els.tabMyVotes.hidden = false;
    } else {
      var loginBtn = document.createElement("button");
      loginBtn.type = "button";
      loginBtn.className = "btn-sm";
      loginBtn.textContent = "登入 / 註冊";
      loginBtn.addEventListener("click", function () {
        els.authPanel.hidden = false;
        els.authEmail.focus();
      });

      els.authStatusBar.append(loginBtn);
      els.toggleCreateBtn.hidden = true;
      els.tabMyVotes.hidden = true;
      if (currentFilter === "my-votes") {
        currentFilter = "all";
        updateTabStyles();
      }
    }
  }

  // ---------- 認證動作 ----------
  async function handleSignIn(e) {
    e.preventDefault();
    notify("登入中…");
    var res = await client.auth.signInWithPassword({
      email: els.authEmail.value.trim(),
      password: els.authPassword.value
    });
    if (res.error) {
      notify(explain(res.error), "error");
    } else {
      els.authPanel.hidden = true;
      els.authForm.reset();
      notify("登入成功！", "ok");
    }
  }

  async function handleSignUp() {
    var email = els.authEmail.value.trim();
    var password = els.authPassword.value;
    if (!email || !password) return notify("請先輸入 Email 與密碼，再點擊註冊。", "warn");
    if (password.length < 6) return notify("密碼至少需 6 個字元。", "warn");
    notify("註冊中…");
    var res = await client.auth.signUp({ email: email, password: password });
    if (res.error) return notify(explain(res.error), "error");
    if (res.data && res.data.session) {
      els.authPanel.hidden = true;
      els.authForm.reset();
      notify("註冊完成並已自動登入！", "ok");
    } else {
      notify("註冊已送出。若無法直接登入，請至 Supabase 後台關閉 Confirm email。", "warn");
    }
  }

  async function handleSignOut() {
    notify("登出中…");
    var res = await client.auth.signOut();
    if (res.error) notify(explain(res.error), "error");
    else notify("已順利登出。", "ok");
  }

  // ---------- 資料載入與投票渲染 ----------
  async function loadPolls() {
    var [pollsRes, optionsRes, votesRes] = await Promise.all([
      client.from("polls").select("*").eq("is_active", true).order("created_at", { ascending: false }),
      client.from("poll_options").select("*").order("display_order", { ascending: true }),
      client.from("poll_votes").select("id, poll_id, option_id, user_id")
    ]);

    if (pollsRes.error) return notify(explain(pollsRes.error), "error");
    if (optionsRes.error) return notify(explain(optionsRes.error), "error");
    if (votesRes.error) return notify(explain(votesRes.error), "error");

    var polls = pollsRes.data || [];
    var options = optionsRes.data || [];
    var votes = votesRes.data || [];

    // 計算關聯結構
    var optionsByPoll = {};
    options.forEach(function (opt) {
      if (!optionsByPoll[opt.poll_id]) optionsByPoll[opt.poll_id] = [];
      optionsByPoll[opt.poll_id].push(opt);
    });

    var votesByOption = {};
    var votesByPoll = {};
    var userVoteByPoll = {}; // 当前使用者在此 poll 投的 option_id

    votes.forEach(function (v) {
      votesByOption[v.option_id] = (votesByOption[v.option_id] || 0) + 1;
      votesByPoll[v.poll_id] = (votesByPoll[v.poll_id] || 0) + 1;
      if (currentUser && v.user_id === currentUser.id) {
        userVoteByPoll[v.poll_id] = v.option_id;
      }
    });

    // 依篩選過濾
    var displayPolls = polls;
    if (currentFilter === "my-votes") {
      displayPolls = polls.filter(function (p) {
        return !!userVoteByPoll[p.id];
      });
    }

    renderPollCards(displayPolls, optionsByPoll, votesByOption, votesByPoll, userVoteByPoll);
  }

  function renderPollCards(polls, optionsByPoll, votesByOption, votesByPoll, userVoteByPoll) {
    if (!polls.length) {
      var empty = document.createElement("div");
      empty.className = "empty-box card";
      empty.textContent = currentFilter === "my-votes" ? "您目前尚未參與任何投票。" : "目前尚無進行中的投票。";
      els.pollsContainer.replaceChildren(empty);
      return;
    }

    var cards = polls.map(function (poll) {
      var pollCard = document.createElement("article");
      pollCard.className = "card";

      // 標題與票數徽章
      var header = document.createElement("div");
      header.className = "card-header";

      var title = document.createElement("h2");
      title.className = "card-title";
      title.textContent = poll.title;

      var totalVotesCount = votesByPoll[poll.id] || 0;
      var totalBadge = document.createElement("span");
      totalBadge.className = "badge-total-votes";
      totalBadge.textContent = "累計 " + totalVotesCount + " 票";

      header.append(title, totalBadge);
      pollCard.append(header);

      // 描述說明（若有）
      if (poll.description) {
        var desc = document.createElement("p");
        desc.className = "card-desc";
        desc.textContent = poll.description;
        pollCard.append(desc);
      }

      // 選項清單
      var optionsList = document.createElement("div");
      optionsList.className = "options-list";

      var pollOpts = optionsByPoll[poll.id] || [];
      var userVotedOptId = userVoteByPoll[poll.id] || null;

      pollOpts.forEach(function (opt) {
        var optVotes = votesByOption[opt.id] || 0;
        var percentage = totalVotesCount > 0 ? Math.round((optVotes / totalVotesCount) * 100) : 0;
        var isSelected = userVotedOptId === opt.id;

        var optItem = document.createElement("div");
        optItem.className = "option-item" + (isSelected ? " selected" : "");

        // 動態得票進度長條背景
        var progressBg = document.createElement("div");
        progressBg.className = "progress-bar-bg";
        progressBg.style.width = percentage + "%";
        optItem.append(progressBg);

        // 選項內容主體
        var content = document.createElement("div");
        content.className = "option-content";

        var labelWrap = document.createElement("div");
        labelWrap.className = "option-label-wrap";

        var radio = document.createElement("div");
        radio.className = "option-radio";

        var label = document.createElement("span");
        label.className = "option-label";
        label.textContent = opt.label;

        labelWrap.append(radio, label);

        if (isSelected) {
          var votedTag = document.createElement("span");
          votedTag.className = "voted-tag";
          votedTag.textContent = "✓ 您的選擇";
          labelWrap.append(votedTag);
        }

        // 統計數據
        var stats = document.createElement("div");
        stats.className = "option-stats";

        var pctText = document.createElement("span");
        pctText.className = "stat-percentage";
        pctText.textContent = percentage + "%";

        var votesText = document.createElement("span");
        votesText.className = "stat-votes";
        votesText.textContent = "(" + optVotes + " 票)";

        stats.append(pctText, votesText);
        content.append(labelWrap, stats);
        optItem.append(content);

        // 點擊投票事件
        optItem.addEventListener("click", function () {
          handleCastVote(poll.id, opt.id, userVotedOptId);
        });

        optionsList.append(optItem);
      });

      pollCard.append(optionsList);

      // 卡片底端狀態與撤票操作
      var footer = document.createElement("div");
      footer.className = "card-footer";

      var statusText = document.createElement("span");
      if (!currentUser) {
        statusText.textContent = "訪客可即時查看票數，登入後即可投下您的選票。";
      } else if (userVotedOptId) {
        statusText.textContent = "您已完成投票（RLS 門禁保護：每人一票）。";
      } else {
        statusText.textContent = "點擊任一選項即可直接投票。";
      }
      footer.append(statusText);

      // 撤回選票按鈕（若已投過）
      if (currentUser && userVotedOptId) {
        var revokeBtn = document.createElement("button");
        revokeBtn.type = "button";
        revokeBtn.className = "revoke-btn";
        revokeBtn.textContent = "撤回投票";
        revokeBtn.addEventListener("click", function () {
          handleRevokeVote(poll.id);
        });
        footer.append(revokeBtn);
      }

      pollCard.append(footer);
      return pollCard;
    });

    els.pollsContainer.replaceChildren.apply(els.pollsContainer, cards);
  }

  // ---------- 執行投票邏輯 ----------
  async function handleCastVote(pollId, targetOptionId, currentVotedOptId) {
    if (!currentUser) {
      notify("請先登入後方可投票！", "warn");
      els.authPanel.hidden = false;
      els.authEmail.focus();
      return;
    }

    if (currentVotedOptId === targetOptionId) {
      notify("您已經投給這個選項了。若想取消，請按下方「撤回投票」。", "info");
      return;
    }

    notify("送出選票中…");

    // 若使用者原先已投過其他選項，先刪除原先選票以符合資料庫 unique 約束
    if (currentVotedOptId) {
      var delRes = await client.from("poll_votes").delete().eq("poll_id", pollId).eq("user_id", currentUser.id);
      if (delRes.error) return notify(explain(delRes.error), "error");
    }

    // 寫入新選票
    var insRes = await client.from("poll_votes").insert({
      poll_id: pollId,
      option_id: targetOptionId,
      user_id: currentUser.id
    });

    if (insRes.error) {
      notify(explain(insRes.error), "error");
    } else {
      notify("投票成功！數據已即時更新。", "ok");
      loadPolls();
    }
  }

  // ---------- 撤回選票 ----------
  async function handleRevokeVote(pollId) {
    if (!currentUser) return;
    if (!window.confirm("確定要撤回您在此投票的選票嗎？")) return;
    notify("撤回選票中…");
    var res = await client.from("poll_votes").delete().eq("poll_id", pollId).eq("user_id", currentUser.id);
    if (res.error) {
      notify(explain(res.error), "error");
    } else {
      notify("已順利撤回選票。", "ok");
      loadPolls();
    }
  }

  // ---------- 發起新投票 ----------
  async function handleCreatePoll(e) {
    e.preventDefault();
    if (!currentUser) return notify("請先登入！", "warn");

    var title = els.newPollTitle.value.trim();
    var desc = els.newPollDesc.value.trim();
    var optInputs = Array.from(document.querySelectorAll(".new-opt-input"));
    var labels = optInputs.map(function (input) { return input.value.trim(); }).filter(Boolean);

    if (labels.length < 2) {
      return notify("請至少填寫 2 個有效的投票選項！", "warn");
    }

    notify("發布投票中…");

    // 1. 建立 poll 主題
    var pollRes = await client.from("polls").insert({
      title: title,
      description: desc || null,
      created_by: currentUser.id
    }).select().single();

    if (pollRes.error) return notify(explain(pollRes.error), "error");
    var newPoll = pollRes.data;

    // 2. 建立 poll_options
    var optionsToInsert = labels.map(function (lbl, idx) {
      return {
        poll_id: newPoll.id,
        label: lbl,
        display_order: idx + 1
      };
    });

    var optRes = await client.from("poll_options").insert(optionsToInsert);
    if (optRes.error) return notify(explain(optRes.error), "error");

    notify("全新投票發布成功！", "ok");
    els.createPollForm.reset();
    els.createPollPanel.hidden = true;
    loadPolls();
  }

  // ---------- 增加選項輸入欄位 ----------
  function handleAddOptionField() {
    var count = document.querySelectorAll(".new-opt-input").length + 1;
    var input = document.createElement("input");
    input.type = "text";
    input.className = "new-opt-input";
    input.maxLength = 100;
    input.placeholder = "選項 " + count;
    els.optionsInputs.append(input);
    input.focus();
  }

  // ---------- 篩選分頁切換 ----------
  function updateTabStyles() {
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      if (btn.dataset.filter === currentFilter) btn.classList.add("active");
      else btn.classList.remove("active");
    });
  }

  function handleFilterChange(e) {
    var btn = e.target.closest(".tab-btn");
    if (!btn) return;
    currentFilter = btn.dataset.filter;
    updateTabStyles();
    loadPolls();
  }

  // ---------- 初始化 ----------
  function start() {
    var problem = checkConfig();
    if (problem) {
      els.configWarning.hidden = false;
      if (problem === "SECRET") {
        els.configWarning.className = "alert alert-danger";
        els.configMessage.textContent = "config.js 誤貼為 Secret key（萬能鑰匙），系統已停止連線以策安全。請至 Supabase 將其作廢並改用 Publishable key。";
      } else {
        els.configMessage.textContent = problem;
      }
      return;
    }

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      return notify("Supabase SDK 載入失敗，請檢查網路連線。", "error");
    }

    client = window.supabase.createClient(cleanUrl(cfg.SUPABASE_URL), String(cfg.SUPABASE_KEY).trim());

    // 綁定事件監聽
    els.authForm.addEventListener("submit", handleSignIn);
    els.submitSignup.addEventListener("click", handleSignUp);
    els.closeAuthBtn.addEventListener("click", function () { els.authPanel.hidden = true; });

    els.toggleCreateBtn.addEventListener("click", function () {
      els.createPollPanel.hidden = !els.createPollPanel.hidden;
      if (!els.createPollPanel.hidden) els.newPollTitle.focus();
    });
    els.cancelCreateBtn.addEventListener("click", function () {
      els.createPollPanel.hidden = true;
    });
    els.addMoreOptBtn.addEventListener("click", handleAddOptionField);
    els.createPollForm.addEventListener("submit", handleCreatePoll);

    document.querySelector(".filter-tabs").addEventListener("click", handleFilterChange);

    // 監聽 Auth 變化
    client.auth.onAuthStateChange(function (_event, session) {
      currentUser = session ? session.user : null;
      renderAuthBar();
      loadPolls();
    });
  }

  start();
})();
