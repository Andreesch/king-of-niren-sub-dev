var socket;

function socketConnection() {
    const server_address = document.forms[0].elements[3].value;
    socket = io(server_address);

    // Esconde o de erro, mostra o de carregando.
    $('.status-critical').hide();
    $('.status-loading').show();

    socket.on('connect', function(){
        $('.status-perfect').show();
        $('.status-critical').hide();
        $('.status-loading').hide();
    });

    // Espera que o SOCKET responda em 3 segundos, do contrário mostra erro de conexão.
    setTimeout(function(){
      if (socket.disconnected) {
        $('.status-loading').hide();
        $('.status-perfect').hide();
        $('.status-critical').show();
      }
    }, 3000);

    /* socket.on('disconnect', function(data){
      window.alert('desconectado do servidor.');
    });
    */
}

function signIn() {    
      var data = {
        email: document.forms[0].elements[0].value,
        password: document.forms[0].elements[1].value,
        name: document.forms[0].elements[2].value
      };

      this.socket.emit('login', data);

      this.socket.on('join-game', function(data){
          document.getElementById('login-container').style.display = "none";
          document.getElementById('game-container').style.display = "flex";
          buildGame();
      });

      this.socket.on('msg-error', function(data){
          window.alert('Ops, ocorreu um erro. Mensagem: ' + data);
      });
}

var buildGame = function() {
  var overlapWeapon;

  window.addEventListener('keydown', event => {
    if (event.which === 13) {
      sendMessage();
    }
  });

  class BootScene extends Phaser.Scene {
    constructor() {
      super({
        key: 'BootScene',
        active: true
      });
    }

    preload() {
      // map tiles
      this.load.image('tiles', 'assets/map/spritesheet-extruded.png');
      // mapa em json
      this.load.tilemapTiledJSON('map', 'assets/map/map.json');
      // sprite do boneco
      this.load.spritesheet('player', 'assets/RPG_assets.png', {
        frameWidth: 16,
        frameHeight: 16
      });

      this.load.image('sword', 'assets/images/attack-icon.png');
    }

    create() {
      this.scene.start('WorldScene');
    }
  }

class WorldScene extends Phaser.Scene {
  constructor() {
    super({
      key: 'WorldScene'
    });
  }

  create() {
    this.socket = socket;
    this.otherPlayers = this.physics.add.group();

    // cria o mapa
    this.createMap();

    // cria animações
    this.createAnimations();

    // inputs do jogador (teclas)
    this.cursors = this.input.keyboard.createCursorKeys();

    // Eventos socket
    this.socket.on('currentPlayers', function (players) {
      Object.keys(players).forEach(function (id) {
        if (players[id].playerId === this.socket.id) {
          this.createPlayer(players[id]);
        } else {
          this.addOtherPlayers(players[id]);
        }
      }.bind(this));
    }.bind(this));

    this.socket.on('newPlayer', function (playerInfo) {
      this.addOtherPlayers(playerInfo);
    }.bind(this));

    this.socket.on('disconnect', function (playerId) {
      this.otherPlayers.getChildren().forEach(function (player) {
        if (playerId === player.playerId) {
          player.weapon.destroy();
          player.destroy();
        }
      }.bind(this));
    }.bind(this));

    this.socket.on('playerMoved', function (playerInfo) {
      this.otherPlayers.getChildren().forEach(function (player) {

        if (playerInfo.playerId === player.playerId) {

          if(player.x < playerInfo.x) {
            player.anims.play('left', true);
            player.flipX = false;

            player.weapon.flipX = false;
            player.weapon.setPosition(playerInfo.x+10, playerInfo.y);
          } else {
            player.anims.play('right', true);
            player.flipX = true;

            player.weapon.flipX = true;
            player.weapon.setPosition(playerInfo.x-10, playerInfo.y);
          }

          if(player.y < playerInfo.y) {
            player.anims.play('down', true);
          } else {
            player.anims.play('up', true);
          }

          player.setPosition(playerInfo.x, playerInfo.y);
        }
      }.bind(this));
    }.bind(this));

    this.socket.on('playerMovementStop', function() {
      this.otherPlayers.getChildren().forEach(function (player) {
          player.anims.stop();
      }.bind(this));
    }.bind(this));

    this.socket.on('playerAttack', function(atkData) {
      this.otherPlayers.getChildren().forEach(function (player) {
        if (atkData.playerId === player.playerId) {
          player.playerLife = atkData.newLife;
          console.log(player.playerLife);
        }
      }.bind(this));
    }.bind(this));

    this.socket.on('kill', function () {
      const location = this.getValidLocation();      
      this.container.x = location.x;
      this.container.y = location.y;
      
      // Reinicia contador da vida
      this.lifeBar.setText("100");

      this.update();
    }.bind(this));

    this.socket.on('atk', function (playerAtkData) {

      this.otherPlayers.getChildren().forEach(function (player) {
        if (playerAtkData.playerId === player.playerId) {
          if (player.weapon.flipX) {
            player.weapon.angle -= 10;
          } else {
            player.weapon.angle += 10;
          }
          setTimeout(() => {
            player.weapon.angle = 0;
          }, 150);
        }
      }.bind(this));
    }.bind(this));

    // Envia para o servidor que o player deverá ser criado.
    this.socket.emit('create-player');

    /* score-board (criar)
    this.socket.on('update-scores', function(data){
        var scoreBoardData = [];

        data.forEach(function(score){
            var scoreObj = ""+score.playerName+" - " + score.playerScore;
            scoreBoardData.push(scoreObj); 
        });

        console.log(scoreBoardData);
    });
    */
  }

  createMap() {
    // Criação do mapa
    this.map = this.make.tilemap({
      key: 'map'
    });

    // Spritesheet é o nome do arquivo de tiles-map
    var tiles = this.map.addTilesetImage('spritesheet', 'tiles', 16, 16, 1, 2);

    // Cria alguns layers (enfeites)
    this.map.createStaticLayer('Grass', tiles, 0, 0);
    this.map.createStaticLayer('Obstacles', tiles, 0, 0);

    // Delimita o mapa
    this.physics.world.bounds.width = this.map.widthInPixels;
    this.physics.world.bounds.height = this.map.heightInPixels;
  }

  createAnimations() {
    //  animation with key 'left', we don't need left and right as we will use one and flip the sprite
    this.anims.create({
      key: 'left',
      frames: this.anims.generateFrameNumbers('player', {
        frames: [1, 7, 1, 13]
      }),
      frameRate: 10,
      repeat: -1
    });

    // animation with key 'right'
    this.anims.create({
      key: 'right',
      frames: this.anims.generateFrameNumbers('player', {
        frames: [1, 7, 1, 13]
      }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'up',
      frames: this.anims.generateFrameNumbers('player', {
        frames: [2, 8, 2, 14]
      }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'down',
      frames: this.anims.generateFrameNumbers('player', {
        frames: [0, 6, 0, 12]
      }),
      frameRate: 10,
      repeat: -1
    });
  }

  createPlayer(playerInfo) {
    this.player = this.add.sprite(0, 0, 'player', 6);

    this.container = this.add.container(playerInfo.x, playerInfo.y);
    this.container.setSize(16, 16);
    this.physics.world.enable(this.container);

    // Adiciona texto com vida
    this.lifeBar = this.add.text(-6, -15, playerInfo.playerLife, { fontSize: '8px'});
    this.container.add(this.lifeBar);
    this.player.lifeBar = this.lifeBar;

    this.container.add(this.player);

    // adiciona espada
    this.weapon = this.add.sprite(10, 0, 'sword');
    this.weapon.setScale(0.5);
    this.weapon.setSize(8, 8);
    this.physics.world.enable(this.weapon);

    this.container.add(this.weapon);
    this.attacking = false;

    // atualiza camera
    this.updateCamera();

    // delimita o mapa
    this.container.body.setCollideWorldBounds(true);

    overlapWeapon = this.physics.add.overlap(this.weapon, this.otherPlayers, this.onMeetEnemy, false, this);
    this.physics.add.collider(this.container, this.spawns);
  }

  addOtherPlayers(playerInfo) {
    const otherPlayer = this.add.sprite(playerInfo.x, playerInfo.y, 'player', 6);
    otherPlayer.setTint(Math.random() * 0xffffff);
    otherPlayer.playerId = playerInfo.playerId;
    otherPlayer.playerLife = playerInfo.playerLife;
    this.otherPlayers.add(otherPlayer);

    // Adiciona espada
    otherPlayer.weapon = this.add.sprite(playerInfo.x + 10, playerInfo.y, 'sword');
    otherPlayer.weapon.setScale(0.5);
    otherPlayer.weapon.setSize(8, 8);
    this.physics.world.enable(otherPlayer.weapon);
  }

  updateCamera() {
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.cameras.main.startFollow(this.container);
    this.cameras.main.roundPixels = true;
  }

  getValidLocation() {
    var validLocation = false;
    var x, y;
  
    x = Phaser.Math.RND.between(0, this.physics.world.bounds.width);
    y = Phaser.Math.RND.between(0, this.physics.world.bounds.height);

    return { x, y };
  }

  onMeetEnemy(player, enemy) {
    if (this.attacking) {
        console.log(enemy.body.gameObject.playerId + " - " + enemy.body.gameObject.playerLife);
        this.socket.emit('playerAttack', { playerId: enemy.body.gameObject.playerId, atkDamage: 10, attacker: player.playerId });

        overlapWeapon.active = false;

        setTimeout(function() {
          overlapWeapon.active = true;
        }, 500);
    }
  }

  update() {
    if (this.container) {
      var player = this.player;

      this.container.body.setVelocity(0);

      // Horizontal movement
      if (this.cursors.left.isDown) {
        this.container.body.setVelocityX(-80);
      } else if (this.cursors.right.isDown) {
        this.container.body.setVelocityX(80);
      }

      // Vertical movement
      if (this.cursors.up.isDown) {
        this.container.body.setVelocityY(-80);
      } else if (this.cursors.down.isDown) {
        this.container.body.setVelocityY(80);
      }

      // Update the animation last and give left/right animations precedence over up/down animations
      if (this.cursors.left.isDown) {
        this.player.anims.play('left', true);
        this.player.flipX = true;

        this.weapon.flipX = true;
        this.weapon.setX(-10);
      } else if (this.cursors.right.isDown) {
        this.player.anims.play('right', true);
        this.player.flipX = false;

        this.weapon.flipX = false;
        this.weapon.setX(10);
      } else if (this.cursors.up.isDown) {
        this.player.anims.play('up', true);
      } else if (this.cursors.down.isDown) {
        this.player.anims.play('down', true);
      } else {
        this.player.anims.stop();
        this.socket.emit('playerMovementStop');
      }

      if (Phaser.Input.Keyboard.JustDown(this.cursors.space) && !this.attacking) {
        this.attacking = true;
        setTimeout(() => {
          this.attacking = false;
          this.weapon.angle = 0;
        }, 150);
      }

      if (this.attacking) {
        this.socket.emit('atk', {playerId: this.socket.id});
        if (this.weapon.flipX) {
          this.weapon.angle -= 10;
        } else {
          this.weapon.angle += 10;
        }
      }

      // emit player movement
      var x = this.container.x;
      var y = this.container.y;
      var flipX = this.player.flipX;
      if (this.container.oldPosition && (x !== this.container.oldPosition.x || y !== this.container.oldPosition.y || flipX !== this.container.oldPosition.flipX)) {
        this.socket.emit('playerMovement', { x, y, flipX });
      }
      // save old position data
      this.container.oldPosition = {
        x: this.container.x,
        y: this.container.y,
        flipX: this.player.flipX
      };

      this.socket.on('life-update', function(data){
        player.lifeBar.setText(data);
      });
    }
  }
}

var config = {
  type: Phaser.AUTO,
  parent: 'content',
  width: 320,
  height: 240,
  zoom: 3,
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: {
        y: 0
      },
      debug: false
    }
  },
  scene: [
    BootScene,
    WorldScene
  ]
};

var game = new Phaser.Game(config);

}