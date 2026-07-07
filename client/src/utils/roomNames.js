const ROOM_SUGGESTIONS = [
  '☕ Kahve Sohbeti',
  '🎵 Müzik Buluşması',
  '💡 Fikir Atölyesi',
  '🎮 Oyun Odası',
  '📚 Kitap Kulübü',
  '🎬 Film Tartışması',
  '🌙 Gece Muhabbeti',
  '☀️ Sabah Sohbeti',
  '🎤 Open Mic',
  '🧘 Rahatla & Sohbet Et',
  '🎲 Rastgele Sohbet',
  '☕ Çay Muhabbeti',
  '🌸 Hafta Sonu Sohbeti',
  '🎯 Sohbet Halkası',
  '☕ Kahve Molası',
];

export function getRandomRoomName() {
  return ROOM_SUGGESTIONS[Math.floor(Math.random() * ROOM_SUGGESTIONS.length)];
}

export default ROOM_SUGGESTIONS;
