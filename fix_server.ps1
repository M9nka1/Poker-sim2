$content = Get-Content "server.js" -Raw

# Исправление первого forEach в notifyHandComplete
$content = $content -replace 'session\.players\.forEach\(\(player, playerId\) => \{\s*const playerSocket = io\.sockets\.sockets\.get\(player\.socketId\);\s*if \(playerSocket\) \{\s*playerSocket\.emit\(''hand-completed''', 
'session.players.forEach((player, playerId) => {
      if (this.players.has(playerId)) {
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
          playerSocket.emit(''hand-completed'''

# Исправление второго forEach в notifyPlayersOfNewHand
$content = $content -replace 'session\.players\.forEach\(\(player, playerId\) => \{\s*const playerSocket = io\.sockets\.sockets\.get\(player\.socketId\);\s*if \(playerSocket\) \{\s*playerSocket\.emit\(''new-hand-auto-started''', 
'session.players.forEach((player, playerId) => {
      if (this.players.has(playerId)) {
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
          playerSocket.emit(''new-hand-auto-started'''

# Добавление закрывающих скобок
$content = $content -replace '        \}\s*\}\s*\}\s*\);', '        }
      }
    });'

Set-Content "server.js" $content

Write-Host "Файл server.js исправлен!" 