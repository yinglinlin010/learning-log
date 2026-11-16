// 連線設定：只放「可以公開」的兩個值。
// 這兩個值會跟著網頁送到每個人的瀏覽器，按 F12 就看得到，本來就不是秘密。
// 真正擋住別人看你資料的，是資料庫的門禁（RLS，寫在 schema.sql），不是把這兩個值藏起來。

window.APP_CONFIG = {
  SUPABASE_URL: "https://uhdzewyrfkffvrkaeilm.supabase.co",
  SUPABASE_KEY: "sb_publishable_32kxpPPeVbrASx8yPrZVwA_cW2fyj9c"
};
