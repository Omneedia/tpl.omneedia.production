/**
 *
 *	Omneedia Worker Foundation
 *	v 0.9.9-Alpha
 *
 **/

$_VERSION = "0.9.9-Alpha";
$_FIRST = true;

var Clients={
    uid: {},
    mail: {}
};

var path = require('path');
var cluster = require('cluster');
var os = require('os');
var fs = require('fs');
var net = require('net');
var shelljs = require('shelljs');
var path = require('path');
var express = require("express");
var os_util = require("os-utils");
var request = require("request");
var io = require('socket.io-client');
var authom = require("authom");

var numCPUs="", networkInterfaces="";

var Date  	= 	require('./lib/dates')();
var Math  	= 	require('./lib/math')();
var API		= 	require('./lib/api');
var APP		= 	require('./lib/app');
var AUTH	=	require('./lib/auth');

function setToken() {
	var d = new Date().toMySQL().split(' ')[0];
	return require('crypto').createHash('md5').update(d).digest('hex');
};

function testPort(port, host, pid, cb) {
    net.createConnection(port, host).on("connect", function (e) {
        cb("success", pid, e);
    }).on("error", function (e) {
        cb("failure", pid, e);
    });
};

function isFunction(functionToCheck) {
	var getType = {};
	return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
};	

function getIPAddress() {
    var interfaces = require('os').networkInterfaces();
    for (var devName in interfaces) {
        var iface = interfaces[devName];

        for (var i = 0; i < iface.length; i++) {
            var alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal)
                return alias.address;
        }
    }

    return '0.0.0.0';
};

function freeport(cb) {
    var net = require('net');
    var server = net.createServer()
        , port = 0
    server.on('listening', function () {
        port = server.address().port
        server.close()
    });
    server.on('close', function () {
        cb(null, port)
    });
    server.listen(0);
};

// read Registry
function read_registry(cb) {
	fs.readFile(__dirname + require('path').sep + '..' + require('path').sep + 'registry.json',function(e,r) {
		if (e) global.registry = process.env; else global.registry = JSON.parse(r.toString('utf-8'));
		cb();
	});
};

// read Manifest
function read_manifest(cb) {
	fs.readFile(__dirname + require('path').sep + 'app.manifest',function(e,r) {
		if (e) return new Error('MANIFEST_NOT_FOUND'); else {
			global.manifest = JSON.parse(r.toString('utf-8'));
			cb();
		}
	});
};

function master(err,port) {
		
		var workers = [];
		port=registry['port'];
		if (!port) port=3000;
        
		console.log('Omneedia Worker started at ' + getIPAddress() + ":" + port + " (" + numCPUs + " threads)");
	
	    var cluster_host = registry.cluster;
		console.log("	- Connecting to cluster " + cluster_host);
		
		// SOCKET CLIENT
		var socket = io(cluster_host, {
			query: "engine=instance&registry="+registry.key+"&iokey=" + setToken()
		});

        socket.on('disconnect', function () {
            console.log("	! Loosing cluster...");
        });
	
		// Sockets relay
		socket.on('INSTANCE#ONLINE',function(data) {
			socket.emit('INSTANCE#ONLINE',data);
			console.log('[+] client connected uid#'+data.sid);
		});	
		socket.on('INSTANCE#OFFLINE',function(data) {
			socket.emit('INSTANCE#OFFLINE',data);
			console.log('[-] client uid#'+data.sid+' disconnected.');
		});	
	
        socket.on('connect', function () {
            console.log('	  Cluster Connected.');
			/*socket.emit('OASERVICE#ONLINE', {
				service: "instance"
				, uuid: global.registry.key
				, host: require('os').hostname
				//, label: Config.label
				, pid: process.pid
				, threads: numCPUs
				, os: require('os').platform()
				, release: require('os').release()
			});
			socket.on('OASERVICE#REGISTER', function (dta) {
				if (dta.uuid = global.registry.key) {

					console.log('- Instance registered: PID' + dta.pid);
					console.log('');

				}
			});	*/	
		});
		socket.on('REGISTER_PROFILE',function(config) {
			fs.writeFile(__dirname+path.sep+'auth'+path.sep+'Profiler.json',JSON.stringify(config),function() {
				console.log('	! Updating profile.');	
			});

		});
		socket.on('REGISTER_WORKER',function(config) {
			fs.writeFile(__dirname+path.sep+'etc'+path.sep+'settings.json',JSON.stringify(JSON.parse(config)),function() {
				console.log('	  # Registered.');
				if (!$_FIRST) return;
				console.log("	- Launching instance");
				$_FIRST=false;
				// Helper function for spawning worker at index 'i'.
				var spawn = function (i) {
					workers[i] = cluster.fork();
					workers[i].on('exit', function (worker, code, signal) {
						console.log('	! Respawning worker', i);
						spawn(i);
					});
				};

				// Spawn workers.
				for (var i = 0; i < numCPUs; i++) {
					spawn(i);
				}

				var worker_index = function (ip, len) {
					var s = '';
					for (var i = 0, _len = ip.length; i < _len; i++) {
						if (ip[i] !== '.') {
							s += ip[i];
						}
					};
					if (s.indexOf(':') > -1) s = s.substr(s.lastIndexOf(':') + 1, 255);
					return Number(s) % len;
				};

				var server = net.createServer({
					pauseOnConnect: true
				}, function (connection) {
					var worker = workers[worker_index(connection.remoteAddress, numCPUs)];
					//console.log(connection.remoteAddress);
					worker.send('sticky-session:connection', connection);
				}).listen(port);					

			});
		})

	
};

function server() {
	console.log("	+ Thread started.");
	fs.readFile(__dirname + path.sep + 'etc' + path.sep + 'settings.json',function(e,settings) {
		
		global.settings = JSON.parse(settings.toString('utf-8'));
		
		process.on('uncaughtException', function (err) {
			console.error(err);
			console.log("	! Drone unhandled exception... But continue!");
		});

		var NS = manifest.namespace;
		var _NS = "/" + NS;

		global.reg_session = 'mongodb://' + registry.cluster.split('://')[1] + ':24333';

    	// Initialisation du serveur
    	var app = express();
		
		app.use(require('compression')());
		app.use(require('morgan')('combined'));
    	
		// cookie support
		app.use(require('cookie-parser')());
		
    	var http = app.listen(0, getIPAddress());

    	// Socket SERVER
		app.IO = require('socket.io')(http);
		
		// Cluster manage session
    	var mongo = require('socket.io-adapter-mongo');
    	app.IO.adapter(mongo(reg_session+'/io'));
		
		
    	app.IO.on('connection', function (socket) {
			socket.on('disconnect',function(s){
				console.log('	* Closing socket id#'+socket.id+' - '+s);
				app.IO.emit('INSTANCE#OFFLINE',{
					sid: socket.id
				});
			});
        	console.log('	- Socket id#'+socket.id+' connected.');
			app.IO.emit('INSTANCE#ONLINE',{
				uid: global.registry.key
				, task: global.registry.task
				, namespace: global.manifest.namespace
				, sid: socket.id
				, host: getIPAddress()
				, pid: process.pid
				, threads: numCPUs
				, os: require('os').platform()
				, release: require('os').release()	
			});
			var response = {
				omneedia: {
					engine: $_VERSION
				}
				, session: socket.id
			};
			// Auth socket response
			OASocketonAuth = function (response) {
				var r = JSON.parse(response);
				if (!Clients.uid[r.uid]) Clients.uid[r.uid] = [];
				if (!Clients.mail[r.mail]) Clients.mail[r.mail] = [];
				if (Clients.uid[r.uid].indexOf(socket.id) == -1) Clients.uid[r.uid].push(socket.id);
				if (Clients.mail[r.mail].indexOf(socket.id) == -1) Clients.mail[r.mail].push(socket.id);
				app.IO.sockets.to(socket.id).emit("#auth", response);
			};
			socket.on('#create', function (room) {
				console.log("- " + room + " joined.");
				socket.join(room);
			});
			socket.on('#send', function (o) {
				o = JSON.parse(o);
				console.log(Clients);
				if (!o.users) {
					// on envoie qu'à la session en cours
					app.IO.sockets.to(socket.id).emit(o.uri, o.data);
				} else {
					if (Object.prototype.toString.call(o.users) === '[object Array]') {
						// on envoie qu'aux sockets des élus
						for (var i = 0; i < o.users.length; i++) {
							var _id = o.users[i];
							if (Clients.uid[_id]) {
								var tab = Clients.uid[_id];
								for (var j = 0; j < tab.length; j++) app.IO.sockets.to(tab[j]).emit(o.uri, o.data);
							};
							if (Clients.mail[_id]) {
								var tab = Clients.mail[_id];
								for (var j = 0; j < tab.length; j++) app.IO.sockets.to(tab[j]).emit(o.uri, o.data);
							};
						};
					} else {
						if (o.users == "*") {
							// on broadcast à tout le monde connecté à l'application
							app.IO.sockets.emit(o.uri, o.data);
						}
					}
				};
			});

			socket.emit('session', JSON.stringify(response));
    	});

    	app.use(express.static(__dirname + path.sep + "www"));

		app.use(require('body-parser').urlencoded({
			extended: true
			, limit: '5000mb'
		}));

		app.use(require('body-parser').json({
			limit: "5000mb"
		}));

		// CORS

		app.use(function(req, res, next) {
			res.header('Access-Control-Allow-Credentials', true);
			res.header('Access-Control-Allow-Origin', req.headers.origin);
			res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
			res.header('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept');
			next();
		});	

		app.use(function (error, req, res, next) {
			if (error.status === 400) {
				console.log(error.body);
				return res.send(400);
			};
			console.log(error);
		});
		
		app.get('/stats', function (req, res) {
			res.writeHead(200, {
				'Content-Type': 'application/json'
				, 'charset': 'utf-8'
			});
			var p = {};

			var cluster_host = registry.cluster;

			p.host = getIPAddress();
			p.pid = process.pid;
			p.service = NS;
			p.cpu = {
				hostname: os.hostname()
				, type: os.type()
				, platform: os.platform()
				, arch: os.arch()
				, release: os.release()
				, uptime: os.uptime()
				, loadavg: os.loadavg()
				, totalmem: os.totalmem()
				, freemem: os.freemem()
				, cpus: os.cpus()
			};
			res.end(JSON.stringify(p, null, 4));
    	});

    	app.get('/favicon.ico', function (req, res) {
        	fs.readFile(__dirname+path.sep+'www'+path.sep+'index.html',function(e,index) {
				if (e) return res.status(404).send('Not found');
				try {
					var b64=index.toString('utf-8').split("newLink.href='data:image/png;base64,")[1].split("'")[0];
				} catch(e) {
					return res.status(404).send('Not found');
				};
				res.end(Buffer.from(b64, 'base64'));
			});
    	});			
		
		app.post('/api', API.processRoute);

    	app.get('/api', function (req, res) {
        	res.writeHead(200, {
            	'Content-Type': 'application/json'
            	, 'charset': 'utf-8'
        	});
        	res.end('API Service');
    	});
		
		/*
		UPLOAD MULTI CLUSTER
		*/

		var multer = require('multer');
		var storage = require('gridfs-storage-engine')({
			url: reg_session + '/upload'
		});
		app.UPLOAD = multer({
			storage: storage
		});
		app.upload = app.UPLOAD;
		
    	app.get('/tmp/:uid', function (req, res) {

			var file = "/tmp" + path.sep + "tempfiles" + path.sep + req.params.uid;
			//var _EXT_ = require('./lib/exts')();
			//var ext=_EXT_.getContentType(req.params.uid);
			//res.header("Content-Type", ext+"; charset=utf-8");
			if (!fs.existsSync(file)) {
				res.sendStatus(404);
			} else {
				if (ext=="text/html") {
					fs.readFile(file,function(e,r) {
						if (e) return res.status(404).send('Not found');
						res.end(r.toString('utf-8'));
					});
				} else res.download(file);
				res.on('finish', function () {
					fs.unlink(file);
				});
			}
    	});		
		
		/*
		SESSION
		*/
		
		var session = require('express-session');
		
    	if (reg_session.indexOf('mongodb://') > -1) {
			var MongoStore = require('connect-mongo')(session);
			app.use(session({
				key: 'omneedia'
				, secret: 'omneedia_rulez'
				, saveUninitialized: true
				, resave: true,
				cookie: {
					path: '/',
					domain: registry.uri.substr(registry.uri.indexOf('.'), 255),
					maxAge: 1000 * 60 * 24 // 24 hours
				}
				, store: new MongoStore({
					url: reg_session
				})
			}));
    	};		
		
		// Auth stuff
		if (global.settings.auth) AUTH(app,authom,global.settings);
		
		// App
		APP(app,express);
		
    	authom.listen(app);	
		
		process.on('message', function (message, connection) {
			if (message !== 'sticky-session:connection') {
				return;
			}
			// Emulate a connection event on the server by emitting the
			// event with the connection the master sent us.
			http.emit('connection', connection);
			connection.resume();
		});		

	});
        
}

function start() {

	if (registry.proxy != "") var Request = request.defaults({
		'proxy': registry.proxy
	}); else var Request = request;
	global.Request = Request;	
	global.request = Request;
	
	numCPUs = require('os').cpus().length;
	
	if (registry.threads) {
		if (registry.threads != "*") numCPUs = registry.threads * 1;
	};
		
	if (cluster.isMaster) freeport(master); else server();
		
};

read_registry(function() {
	read_manifest(start);
});
