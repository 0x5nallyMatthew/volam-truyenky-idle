// Võ Lâm Idle - Cấu hình kết nối máy chủ
// Toàn bộ dữ liệu online đi qua máy chủ Node (cùng origin), không lộ key Supabase ra client.
//   api: đường dẫn API của máy chủ (đăng nhập, lưu đám mây, xếp hạng, cấu hình GM)
//   ws : đường dẫn WebSocket realtime (giai đoạn 2 - presence / chat / tổ đội / bang hội)
window.CHAT_CFG = {
  mode: "offline",
  offline: true,
  url: "",
  key: "",
  supabaseUrl: "",
  supabaseKey: "",
  api: "/api",
  ws: "/ws"
};
