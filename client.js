const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io').listen(server);

// Recupera o ip do servidor passado em tempo de execução;
// const clientPort = process.argv[4];
const clientPort = 3001;

app.get('/game.html', function (req, res) {
  res.sendFile(__dirname + '/public/game.html');
});

app.use(express.static(__dirname + '/public'));

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

// outras rotas não mapeadas
app.use((req, res, next) => {
  res.status(404).json({ message: '404 - Não encontrado' });
});

// erros
app.use((err, req, res, next) => {
  console.log(err.message);
  res.status(err.status || 500).json({ error: err.message });
});

server.listen(clientPort, () => {
  console.log(`Novo cliente rodando na porta: ` + clientPort);
});