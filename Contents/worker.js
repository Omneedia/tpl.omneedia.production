/**
 *	Omneedia Worker Foundation
 *	v 1.0.0
 *
 **/

$_VERSION = "1.0.0";
$_DEBUG = true;

var path=require('path');
var os=require('os');
var fs=require('fs');
var cluster=require('cluster');
var express=require("express");
var os_util=require("os-utils");
var request=require("request");

if (!$_DEBUG) console.log = function(){};

// get app.manifest
var json=fs.readFileSync(__dirname+path.sep+"app.manifest");
Manifest=JSON.parse(json);
if (fs.existsSync(__dirname+path.sep+'etc'+path.sep+'settings-prod.json')) {
	var _set=fs.readFileSync(__dirname+path.sep+'etc'+path.sep+'settings-prod.json','utf-8');
	MSettings=JSON.parse(_set);	
};
		
function freeport(cb) 
{
	var net = require('net');
	var server = net.createServer()
    , port = 0
	server.on('listening', function() {
		port = server.address().port
		server.close()
	});
	server.on('close', function() {
		cb(null, port)
	});
	server.listen(0);
};

process.on('uncaughtException', function (err) {
  console.error(err.stack);
  console.log("Node NOT Exiting...");
});

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

//CORS middleware
var allowCrossDomain = function(req, res, next) {
	var oneof = false;
	if(req.headers.origin) {
		res.header('Access-Control-Allow-Origin', req.headers.origin);
		res.header('Access-Control-Allow-Credentials', true);
		oneof = true;
	};
	if(req.headers['access-control-request-method']) {
		res.header('Access-Control-Allow-Methods', req.headers['access-control-request-method']);
		oneof = true;
	};
	if(req.headers['access-control-request-headers']) {
		res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
		oneof = true;
	};
	if(oneof) {
		res.header('Access-Control-Max-Age', 60 * 60 * 24 * 365);
	};

	// intercept OPTIONS method
	if (oneof && req.method == 'OPTIONS') {
		res.send(200);
	}
	else {
		next();
	}
};

var NS=__dirname.split(path.sep)[__dirname.split(path.sep).length-2];
var _NS="/"+NS;

/**
 *
 * AUTH STRATEGY
 *
**/
		
var authom = require("authom");


Auth = {
	user: function(profile,fn) {

		if (profile.provider=="google") var typ="google";
		if (profile.provider=="cas") var typ="cas";		
		Auth.login(profile,typ,function(response) {
			fn(null,response);
		});		
		
	},
	login: function(profile,auth_type,cb) {
		var off="Officer";
		console.log(PROJECT_WEB);
		if (fs.existsSync(PROJECT_WEB+path.sep+".."+path.sep+"auth"+path.sep+off+".js")) {
			var Auth = require(PROJECT_WEB+path.sep+".."+path.sep+"auth"+path.sep+off+".js");
			Officer.using = function(unit) {
				if (fs.existsSync(__dirname+path.sep+'node_modules'+path.sep+unit)) 
				return require(__dirname+path.sep+'node_modules'+path.sep+unit);
			};		
			Officer.login(profile,auth_type,function(response) {
				cb(response);
			});
		};
	}
};

var app = express();

// Sessions

app.use(require('cookie-parser')());

var session_connect=false;

app.use(express.static(__dirname+path.sep+"www"));

app.use(require('compression')());
if ($_DEBUG) app.use(require('morgan')('combined'));

app.use(require('body-parser').urlencoded({
	extended: true
}));

app.use(require('body-parser').json({
	limit: "5000mb"
}));

//app.enable('trust proxy');

app.use(allowCrossDomain);

var exit = function exit() {
  setTimeout(function () {
    process.exit(1);
  }, 0);
};

app.use(function (error, req, res, next) {
  if (error.status === 400) {
    console.log(error.body);
    return res.send(400);
  }

  console.log(error);
  exit();
});

app.get('/stats',function(req,res) {
	res.writeHead(200, {'Content-Type' : 'application/json','charset' : 'utf-8'});
	var p={};
	p.host=getIPAddress();
	p.pid=process.pid;
	p.cluster = {
		host : cluster_host,
		port : cluster_port,
		loadbalancer: {
			host: req.headers.host.split(':')[0]
		}
	};
	p.service=NS;
	p.cpu={
		hostname: os.hostname(),
		type: os.type(),
		platform: os.platform(),
		arch: os.arch(),
		release: os.release(),
		uptime: os.uptime(),
		loadavg: os.loadavg(),
		totalmem: os.totalmem(),
		freemem: os.freemem(),
		cpus: os.cpus()	
	};
	res.end(JSON.stringify(p,null,4));
});

app.get('/favicon.ico',function(req,res) {
	res.end('');
});

function process_api(d,i,batch,res)
{
		if (i>=d.length) {
			var str = JSON.stringify(batch, 'utf8');
			res.end(str);
		} else {
			var api=d[i];
			
			try{
				var name = require.resolve(api.action);
				delete require.cache[name];
			}catch(e){
			};			

		var x=require(__dirname+path.sep+"api"+path.sep+api.action+".js");
			x.using=function(unit) {
				if (fs.existsSync(__dirname+path.sep+'node_modules'+path.sep+unit)) 
				return require(__dirname+path.sep+'node_modules'+path.sep+unit);
			};						
			var myfn=x[api.method].toString().split('function')[1].split('{')[0].trim().split('(')[1].split(')')[0].split(',');
			var response={};
			response.params=[];
			for (var j=0;j<myfn.length;j++)
			{
				if (myfn[j].trim()!="") response.params[response.params.length]=myfn[j].trim();
			};

			var p=[];
			for (var e=0;e<response.params.length-1;e++) {
				p.push(api.data[e]);
			};
			p.push(function(err,response){
				batch[batch.length]={
					action: api.action,
					method: api.method,
					result: response,
					tid: api.tid,
					type: "rpc"
				};
				process_api(d,i+1,batch,res);				
			});
			console.log(p);
			try {
				x[api.method].apply({},p);
				console.log('done.');
			} catch (e) {
				batch.push({
					type: 'exception',
					action: api.action,
					method: api.method,
					message: e.message,
					data: e
				});		
				process_api(d,i+1,batch,res);
			}
		}
	};

function processRoute (req, resp)
{
	var data=req.body;
	var d=[];
	if(data instanceof Array){
		d = data;
	}else{
		d.push(data);
	};
	for (var i=0;i<d.length;i++) process_api(d,0,[],resp);
};


/*
 * SESSION
 */

var session=require('express-session');

try {
	var cluster_host=process.argv[2].split(':')[0];
	var cluster_port=process.argv[2].split(':')[1];
	var reg_session=process.argv[3];
	
	function cluster_post(cluster_host,cluster_port,obj)
	{

		request.post(
			'http://'+cluster_host+':'+cluster_port+'/api',
			{ 
				form: obj
			},
			function (error, response, body) {
				if (!error && response.statusCode == 200) {

				} else {
					if (error) {
						console.log("  ! Cluster "+cluster_host+" not responding.");				
						setTimeout(function() {
							cluster_post(cluster_host,cluster_port,obj);
						},5000);
					}
				}
			}
		);		
		
	};
	
	// check session server settings from cluster
	
	if (reg_session.indexOf('mysql://')>-1) {
		var sessionstore = require('express-mysql-session');
		var zhost=reg_session.split('@')[1].split('/')[0];
		var zusers=reg_session.split('://')[1].split('@')[0];
		var zuser="";
		var zpass="";
		var zport=3306;
		var db=reg_session.lastIndexOf('/');
		db=reg_session.substr(db+1,255);
		if (zhost.indexOf(':')>-1) {
			zport=zhost.split(':')[1];
			zhost=zhost.split(':')[0];		
		};

		zuser=zusers.split(':')[0];
		zpass=zusers.split(':')[1];

		app.use(session({
			key: 'omneedia', 
			secret: 'omneedia_rulez',
			saveUninitialized: true,
			resave: true,
			store: new sessionstore({
				host: zhost,
				port: zport,
				user: zuser,
				password: zpass,
				database: db
			})
		}));
		
	};

	

	
}catch(ex) {
	if (process.argv.length<3) {

		var sessionstore = require ('sessionstore');	
		
		app.use(session({
			key: 'omneedia', 
			secret: 'omneedia_rulez',
			saveUninitialized: true,
			resave: true,	
			store: sessionstore.createSessionStore()
		}));		

	}
}; 

/*
 *	AUTH
 */		
 
 
 
if (MSettings.auth) {
	app.post('/login', function(req,res) {
	});		
	app.post('/remotelogin', function(req,res) {
		var response=JSON.parse(req.body.response);
		var profile={};
		if (response.service=="google") {
			profile=response.data;
			profile.provider="google";
		};
		
		Auth.user(profile,function(err,response) {
			console.log(response);
			req.session.user=response;
			res.end("{}");
		});				
		
	});		
	app.get('/bye', function(req, res){
		res.setHeader('content-type','text/html');
		res.end('<script>top.location.reload(true);window.close();</script>');
	});
	app.get('/logout', function(req, res){
		req.session.destroy();
		res.redirect('/bye');
	});				
	app.post('/account', ensureAuthenticated, function(req, res){
		if (req.body.udid) {
			// on récupère le udid crée côté client
			req.session.udid=new Buffer(req.body.udid, 'base64').toString('utf-8');
			req.session.device=req.session.udid.split('|')[1];
			req.session.uid=req.session.udid.split('|')[0];			
			// on ajoute l'utilisateur pour créer le pudid (personal udid)
			req.session.user.pudid=new Buffer(req.session.uid+'|'+req.session.user.uid+'|'+req.session.device).toString('base64');
			req.session.udid=req.body.udid;
		};	
		if (!req.user) req.user=req.session.user;
		res.end(JSON.stringify(req.user,null,4));
	});  
	app.get('/account', ensureAuthenticated, function(req, res){
		console.log(req.user);
		if (!req.user) req.user=req.session.user;
		res.end(JSON.stringify(req.user,null,4));
	}); 			
	function ensureAuthenticated(req, res, next) {
		if (!req.user) req.user=req.session.user;
		if (req.user) { 
			return next(); 
		};
		res.redirect('/login');
	};				
	if (MSettings.auth.local) {
		// a développer !
	};
	if (MSettings.auth.cas) {
		
		authom.createServer({
		  service: "cas"
		});
					
	};
	if (MSettings.auth.google) {				

		var google=MSettings.auth.google;
		
		authom.createServer({
		  service: "google",
		  id: google.key,
		  secret: google.secret,
		  scope: MSettings.auth.google.scope
		})

		
	};

	authom.on("auth", function(req, res, data) {

		if (data.service=="google") {
			var profile={};
			profile.username=data.data;
			profile.provider="google";					
			Auth.user(profile, function (err, response) {
				req.session.user=response;
				res.setHeader('content-type','text/html');
				res.end("<html><body></body></html>");					
			});					
		};
		if (data.service=="cas") {
			var profile={};
			profile.provider="cas";
			profile.username=data.username;
			Auth.user(profile,function(err,response) {
				console.log(response);
				req.session.user=response;
				res.setHeader('content-type','text/html');
				res.end("<html><body></body></html>");					
			});				  
		};
	});

	authom.on("error", function(req, res, data) {
	  // called when an error occurs during authentication
	  console.log(data);
	});
	app.get("/auth/:service", authom.app);
};

var exit = function exit() {
  setTimeout(function () {
    process.exit(1);
  }, 0);
};

app.use(function (error, req, res, next) {
  if (error.status === 400) {
    log.info(error.body);
    return res.send(400);
  }

  console.log(error);
  exit();
});

app.post('/api',processRoute);

app.get('/api',function(req,res) {
	res.writeHead(200, {'Content-Type' : 'application/json','charset' : 'utf-8'});
	res.end('API Service');
});

app.get('/api/:ns',function(req,res) {
	var url=req.url.split('?');
	if (url.length>1) {
		if (url[1]=="javascript") {
			res.writeHead(200, {'Content-Type' : 'application/x-javascript','charset' : 'utf-8'});
			var REMOTE_API={};
			REMOTE_API.url="http://"+req.headers.host+"/api";
			REMOTE_API.type="remoting";
			REMOTE_API.namespace="App";
			REMOTE_API.descriptor="App.REMOTING_API";
			REMOTE_API.actions={};
			REMOTE_API.actions[req.param('ns')]=[];
			var _api=require(__dirname+path.sep+"api"+path.sep+req.param('ns')+".js");
			for (var e in _api) {
				if (_api[e].toString().substr(0,8)=="function") {
					var obj={};
					obj.name=e;
					var myfn=_api[e].toString().split('function')[1].split('{')[0].trim().split('(')[1].split(')')[0].split(',');
					obj.len=myfn.length-1;
					REMOTE_API.actions[req.param('ns')][REMOTE_API.actions[req.param('ns')].length]=obj;
				}
			};					
			var str="if (Ext.syncRequire) Ext.syncRequire('Ext.direct.Manager');Ext.namespace('App');";
			str+="App.REMOTING_API="+JSON.stringify(REMOTE_API,null)+";";
			str+="Ext.Direct.addProvider(App.REMOTING_API);";
			res.end(str);
		};
		return;
	};
	res.writeHead(200, {'Content-Type' : 'application/json','charset' : 'utf-8'});
	if (fs.existsSync(__dirname+path.sep+"api"+path.sep+req.param('ns')+".js")) {
		res.end("API Service");
	} else res.end('Service not found');
});	

PROJECT_SYSTEM=__dirname+path.sep+"var";
PROJECT_WEB=__dirname+path.sep+"www";
PROJECT_API=__dirname+path.sep+"api";

// load plugins
if (fs.existsSync(__dirname+path.sep+"var"+path.sep+"www")) {
	app.use('/app',express.static(__dirname+path.sep+"var"+path.sep+"www"));
};

if (fs.existsSync(PROJECT_SYSTEM+path.sep+"app.js")) {
	var _App = require(PROJECT_SYSTEM+path.sep+"app.js");
	_App.tmpdir = function(filename) {
		return fs.realpathSync(PROJECT_WEB+path.sep+".."+path.sep+"var"+path.sep+"tmp");
	};
	_App.tmp = function(filename) {
		if (!fs.existsSync(PROJECT_WEB+path.sep+".."+path.sep+"var"+path.sep+"tmp"))
		glob.mkdirSyncRecursive(PROJECT_WEB+path.sep+".."+path.sep+"var"+path.sep+"tmp");
		return fs.realpathSync(PROJECT_WEB+path.sep+".."+path.sep+"var"+path.sep+"tmp")+path.sep+filename;
	};
	_App.using = function(unit) {
		if (fs.existsSync(__dirname+path.sep+'node_modules'+path.sep+unit)) 
		return require(__dirname+path.sep+'node_modules'+path.sep+unit);
	};
	_App.api = require(__dirname+path.sep+'node_modules'+path.sep+"api");
	for (var i=0;i<Manifest.api.length;i++) {
		_App[Manifest.api[i]]=require(PROJECT_SYSTEM+path.sep+'..'+path.sep+'api'+path.sep+Manifest.api[i]+'.js');
		var self = _App[Manifest.api[i]].model = {
					_model: {
						"type" : "raw",
						"metaData" : {
							"idProperty" : -1,
							"totalProperty" : "total",
							"successProperty" : "success",
							"root" : "data",
							"fields" : []
						},
						"total" : 0,
						"data" : [],
						"success" : false,
						"message" : "failure"
					},
					init: function()
					{
						self._model.metaData.fields=[];
						self._model.data=[];
						self._model.success=false;
						self._model.message="failure";
					},
					fields: {
						add: function(o)
						{
							if (o === Object(o)) 
							self._model.metaData.fields.push(o);
							else {
								var t=o.split(',');
								if (t.length==3) {
									var o={
										name: t[0],
										type: t[1],
										length: t[2]					
									};
								} else {
									var o={
										name: o,
										type: 'string',
										length: 255					
									};				
								};
								self._model.metaData.fields.push(o);
							}
						}	
					},
					data: {
						add: function(o)
						{
							self._model.data.push(o);
							self._model.total=self._model.data.length;
						}		
					},
					get: function()
					{
						self._model.success=true;
						self._model.message="success";
						return self._model;
					}
		};
		_App[Manifest.api[i]].using=function(unit) {
			if (fs.existsSync(__dirname+path.sep+'node_modules'+path.sep+unit)) 
			return require(__dirname+path.sep+'node_modules'+path.sep+unit);
		};										
	};	
	_App.init(app,express);
};



/*
app.use(session({
	key: 'omneedia', 
	secret: 'omneedia_rulez',
	saveUninitialized: true,
	resave: true,
	store: sessionstore.createSessionStore({
        type: 'mongodb',
        host: 'localhost',
        port: 27017,
        dbName: 'sessionDb',
        collectionName: 'sessions',
        reapInterval: 600000,
        maxAge: 1000 * 60 * 60 * 24
    })
}));*/


if (process.argv.length>=3) {

/**
Mise en cluster
**/

	freeport(function(er,port) {
		
		// register port with cluster
		var wrench=require('wrench');
		wrench.mkdirSyncRecursive(__dirname+path.sep+".."+path.sep+".."+path.sep+"var"+path.sep+"pids"+path.sep+NS, 0777);
		console.log("  Worker thread "+NS+"\n  started at "+getIPAddress()+":"+port+" - pid: "+process.pid+"\n");	
		app.listen(port);
		fs.writeFileSync(__dirname+path.sep+".."+path.sep+".."+path.sep+"var"+path.sep+"pids"+path.sep+NS+path.sep+process.pid+".pid",port);
		
		// update cluster
		cluster_post(cluster_host,cluster_port,{
			drone : NS,
			host : getIPAddress(),
			port : port,
			pid: process.pid,
			uri: process.argv[4]
		});
		
	});	
} else {

/**
Standalone
**/

	console.log('');
	console.log("  - [DEBUG] Starting worker standalone");
	console.log('');
	var args = process.argv.splice(2);
	var port=args[0] || 80;
	console.log("  Worker thread "+NS+"\n  started at "+getIPAddress()+":"+port+" - pid: "+process.pid+"\n");	
	
	app.listen(port);

}

