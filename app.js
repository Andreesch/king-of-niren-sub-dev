// reads in our .env file and makes those values available as environment variables
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const passport = require('passport');

const routes = require('./routes/main');
const secureRoutes = require('./routes/secure');
const passwordRoutes = require('./routes/password');
const asyncMiddleware = require('./middleware/asyncMiddleware');
const ChatModel = require('./models/chatModel');
const UserModel = require('./models/userModel');

// setup mongo
const uri = process.env.MONGO_CONNECTION_URL;

mongoose.connect(uri, { useNewUrlParser : true, useCreateIndex: true });

mongoose.connection.on('error', (error) => {
  console.log(error);
  process.exit(1);
});

mongoose.connection.on('connected', function () { 
  console.log('connected to mongo');
});

mongoose.set('useFindAndModify', false);

const app = express();
const server = require('http').Server(app);
const io = require('socket.io').listen(server);

const players = {};
const sockets = [];

io.on('connection', function (socket) {
  console.log('Novo usuário conectado: ', socket.id);  
  insertNewSocketToStack(socket);
});

var insertNewSocketToStack = function(socket) {
  sockets.push({socket: socket, socket_id: socket.id});
  mapSocketEvents(socket);
}

var mapSocketEvents = function(socket) {
  socket.on('login', function(data){
    try {
    UserModel.find({
      email: data.email
    }).then(user => {
      if (user != null && user.length > 0) {
        if (user[0].isValidPassword(data.password)) {
          console.log("SENHA CORRETA");
          createNewSocketPlayer(socket);
        } else {
          console.log("SENHA INCORRETA");
          var message = "Usuário já cadastrado, senha incorreta";
          emitSocketErrorMessage(socket, message);
        }
      } else {
          var userEmail = data.email;
          var userPassword = data.password;
          var userName = data.name;

          var user = new UserModel({
            email: userEmail,
            password: userPassword,
            name: userName
          });

          user.save();

          if (user) {
              createNewSocketPlayer(socket);
          }
        }

      }).catch(err => {
        console.error(err)
      });

    } catch (error) {
      var message = "Erro ao criar novo usuário no mongo, retornou a seguinte exception: " + error;
      emitSocketErrorMessage(socket, message);
    }
  });

    // Quando um jogador é desconectado, remove da lista de jogadores e emite a desconexão para o socket.
    socket.on('disconnect', function () {
      console.log('Usuário desconectou: ', socket.id);
      delete players[socket.id];
      // emite a mensagem de remoção para o socket
      io.emit('disconnect', socket.id);
    });
}

var emitSocketErrorMessage = function(socket, message) {
  socket.emit('msg-error', message);
  return;
}

var createNewSocketPlayer = function(socket) {

  socket.on('create-player', function(data) {
    console.log("criando novo player");
    
    // cria um objeto para o novo jogador, atribui uma posição aleatória no mapa e 100 de vida.
    players[socket.id] = {
      flipX: false,
      x: Math.floor(Math.random() * 400) + 50,
      y: Math.floor(Math.random() * 500) + 50,
      playerId: socket.id,
      playerLife: 100
    };

    // envia o objeto criado para o socket do jogador
    socket.emit('currentPlayers', players);

    // transmite via broadcast o novo jogador para os demais sockets (jogadores) conectados.
    socket.broadcast.emit('newPlayer', players[socket.id]);

    

    // Quando o jogador se movimenta, atualiza o objeto com sua nova posição e transmite via broadcast.
    socket.on('playerMovement', function (movementData) {
      players[socket.id].x = movementData.x;
      players[socket.id].y = movementData.y;
      players[socket.id].flipX = movementData.flipX;

      // Emite uma mensagem para todo os jogadores de que aquele jogador se movimentou.
      socket.broadcast.emit('playerMoved', players[socket.id]);
    });

  }); 

  // Pausa na movimentação (animação)
  socket.on('playerMovementStop', function (movementData) {
    socket.broadcast.emit('playerMovementStop', {playerId: socket.id});
  });

  // Ação de ataque (animação)
  socket.on('atk', function (playerIdData) {
    socket.broadcast.emit('atk', playerIdData);
  });

  // Ação de ataca com colisão em algum jogador, diminui a vida do outro jogador.
  socket.on('playerAtack', function (atkData) {
    players[atkData.playerId].playerLife -= atkData.atkDamage;

    socket.emit('playerAtack', {playerId: atkData.playerId, newLife: players[atkData.playerId].playerLife});
    socket.broadcast.emit('playerAtack', {playerId: atkData.playerId, newLife: players[atkData.playerId].playerLife});

    if(players[atkData.playerId].playerLife <= 0) {
      players[atkData.playerId].playerLife = 100;
      io.to(atkData.playerId).emit('kill');
    }
  });

  socket.emit('join-game', null);  
}

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());

require('./auth/auth');

app.get('/game.html', passport.authenticate('jwt', { session : false }), function (req, res) {
  res.sendFile(__dirname + '/public/game.html');
});

app.get('/game.html', function (req, res) {
  res.sendFile(__dirname + '/public/game.html');
});

app.use(express.static(__dirname + '/public'));

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

// rotas principais
app.use('/', routes);
app.use('/', passwordRoutes);
app.use('/', passport.authenticate('jwt', { session : false }), secureRoutes);

// Outras rotas não mapeadas
app.use((req, res, next) => {
  res.status(404).json({ message: '404 - Not Found' });
});

//Erros genéricos
app.use((err, req, res, next) => {
  console.log(err.message);
  res.status(err.status || 500).json({ error: err.message });
});

// Porta servidor configurável, padrão 3000;
server.listen(process.env.PORT || 3000, () => {
  console.log(`Inicializando servidor na porta ${process.env.PORT || 3000}`);
});
