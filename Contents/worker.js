const OMNEEDIA={
	engine:"worker",
	version: "1.0.0a"
};

var fs=require('fs');
var path = require('path');

var cluster=require('cluster');
var numCPUs = require('os').cpus().length;

// check env
var check_env=-1;

if (!fs.existsSync(__dirname+path.sep+'..'+path.sep+'drones')) {
	fs.mkdirSync(__dirname+path.sep+'..'+path.sep+'drones');
	check_env=1;
};
if (!fs.existsSync(__dirname+path.sep+'..'+path.sep+'packages')) {
	fs.mkdirSync(__dirname+path.sep+'..'+path.sep+'packages');
	check_env=1;
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

if (!fs.existsSync(__dirname+path.sep+'..'+path.sep+'config')) fs.mkdirSync(__dirname+path.sep+'..'+path.sep+'config');

if (!fs.existsSync(__dirname+path.sep+'..'+path.sep+'config'+path.sep+'workers.json')) {
	var cmd={
		"cluster" : "cluster_host:9191",
		"threads" : "*",
		"worker" : {
			"threads": "*"
		},
		"key"	  : "a6b3Efdq",
		"port"	  : "9090"
	};
	fs.writeFileSync(__dirname+path.sep+'..'+path.sep+'config'+path.sep+'workers.json',JSON.stringify(cmd,null,4));
	check_env=1;
};

//

var json=fs.readFileSync(__dirname+path.sep+".."+path.sep+"config"+path.sep+"workers.json");
var Config = JSON.parse(json);

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

if (Config.threads != "*") {
    //if (Config.threads * 1 <= numCPUs)
	numCPUs = Config.worker.threads * 1;
};

if (!Config.label) {
	var shortid=require('shortid');
	Config.label=shortid.generate();
	fs.writeFileSync(__dirname+path.sep+".."+path.sep+"config"+path.sep+"workers.json",JSON.stringify(Config,null,4));
};

if (cluster.isMaster) {
	if (check_env==1) {
		process.exit();
		return;
	} else {
		for (var i = 0, n = numCPUs; i < n; i += 1) cluster.fork();
		console.log('');
		console.log('  Omneedia Worker started at '+getIPAddress()+":"+Config.port+" ("+numCPUs+" threads)");

		var cluster_host = Config.cluster.split(':')[0];

		console.log("  Connecting to cluster " + cluster_host);
		
		//var socket = require('socket.io-client')('http://' + cluster_host,{query:"token=bar"});
		
		var socket = require('socket.io-client')('https://' + cluster_host,{query:"cccc=e18f07a846016c0559a6bc70776f598addf24cfe712d2f388fe7fcb0540ffc45ada581dbadb22457eb5c44bf182890ca"});

		socket.on('disconnect', function () {
			console.log(' ');
			console.log("  Cluster lost...".red);
		});

		socket.on('connect', function () {
			console.log(' ');
			console.log('  Cluster Connected');

			// update cluster
			if (Config.hostname) var hostname=Config.hostname; else var hostname=getIPAddress()+':'+Config.port;
			socket.emit('OASERVICE#ONLINE', {
				service: "worker"
				, host: hostname
				, label: Config.label
				, pid: process.pid
				, threads: numCPUs
				, os: require('os').platform()
				, release: require('os').release()
			});
			socket.on('OASERVICE#REGISTER', function () {
				console.log('  - Worker engine registered.');
			});

		});

		socket.on('event', function (data) {


		});

		socket.on('disconnect', function () {

		});

	}
} else
{

	var express=require("express");
	var watchr = require('watchr');
	var shelljs = require('shelljs');
	var list=[];
	var ACTIVE=-1;

	if (!fs.existsSync(__dirname+path.sep+".."+path.sep+"config"+path.sep+"workers.json")) {
		console.log('!! workers.config not found. FATAL ERROR');
		return;
	};

	if (!fs.existsSync(__dirname+path.sep+".."+path.sep+"config"+path.sep+"service.template")) {
		console.log('!! service.template not found. FATAL ERROR');
		return;
	};
	try {
		if (!fs.existsSync(__dirname+path.sep+'..'+path.sep+"drones")) fs.mkdirSync(__dirname+path.sep+'..'+path.sep+"drones");
	}catch(e){};
	try {
		if (!fs.existsSync(__dirname+path.sep+'..'+path.sep+"tmp")) fs.mkdirSync(__dirname+path.sep+'..'+path.sep+"tmp");
	}catch(e){};
	try {
		if (!fs.existsSync(__dirname+path.sep+'..'+path.sep+"packages")) fs.mkdirSync(__dirname+path.sep+'..'+path.sep+"packages");
	}catch(e){};

	function processFiles(item)
	{
		if (!fs.existsSync(__dirname+path.sep+'..'+path.sep+"tmp")) fs.mkdirSync(__dirname+path.sep+'..'+path.sep+"tmp");
		// unzip files
		var AdmZip = require('adm-zip');
		var zip = new AdmZip(item);
		var zipEntries = zip.getEntries();
		var info=zipEntries[0].entryName.split(path.sep);
		var info_path=zipEntries[0].entryName.substr(0,zipEntries[0].entryName.lastIndexOf(path.sep));
		var info_version=info[0];
		var info_namespace=info[1];
		if (!fs.existsSync(__dirname+path.sep+'..'+path.sep+"tmp"+path.sep+info_namespace)) fs.mkdirSync(__dirname+path.sep+'..'+path.sep+"tmp"+path.sep+info_namespace);
		zip.extractAllTo(__dirname+path.sep+'..'+path.sep+"tmp"+path.sep+info_namespace);

		var p=__dirname+path.sep+'..'+path.sep+"tmp"+path.sep+info_namespace+path.sep+info_path;
		var d=__dirname+path.sep+'..'+path.sep+"drones"+path.sep+info_namespace;
		if (!fs.existsSync(d)) fs.mkdirSync(d);
		d+=path.sep+info_version;
		if (!fs.existsSync(d)) fs.mkdirSync(d);
		var contents=p+path.sep+"Contents"+path.sep;
		if (!fs.existsSync(contents+"app.manifest")) {
			return;
		};
		if (!fs.existsSync(contents+"etc"+path.sep+"settings-prod.json")) {
			return;
		};
		// console.log(p+path.sep+".."+path.sep+".."+path.sep+"registry.json");
		if (!fs.existsSync(p+path.sep+".."+path.sep+".."+path.sep+"registry.json")) {
			return;
		} else shelljs.mv(p+path.sep+".."+path.sep+".."+path.sep+"registry.json",p);

		if (!fs.existsSync(__dirname+path.sep+'..'+path.sep+'var')) fs.mkdirSync(__dirname+path.sep+'..'+path.sep+'var');
		if (!fs.existsSync(__dirname+path.sep+'..'+path.sep+'var'+path.sep+"log")) fs.mkdirSync(__dirname+path.sep+'..'+path.sep+'var'+path.sep+"log");
		if (!fs.existsSync(__dirname+path.sep+'..'+path.sep+'var'+path.sep+'pids')) fs.mkdirSync(__dirname+path.sep+'..'+path.sep+'var'+path.sep+'pids');
		if (!fs.existsSync(__dirname+path.sep+'..'+path.sep+'var'+path.sep+'pids'+path.sep+item.split('.drone')[0].substr(item.lastIndexOf(path.sep)+1,255))) fs.mkdirSync(__dirname+path.sep+'..'+path.sep+'var'+path.sep+'pids'+path.sep+item.split('.drone')[0].substr(item.lastIndexOf(path.sep)+1,255));

		var config=JSON.parse(fs.readFileSync(__dirname+path.sep+".."+path.sep+"config"+path.sep+"workers.json","utf-8"));

		// on lance npm
		if (config.proxy) {
			console.log('Configuring proxy');
			shelljs.exec('cd "'+p+path.sep+'Contents" && "'+__dirname+path.sep+'nodejs'+path.sep+'bin'+path.sep+'npm" config set proxy '+config.proxy);
			shelljs.exec('cd "'+p+path.sep+'Contents" && "'+__dirname+path.sep+'nodejs'+path.sep+'bin'+path.sep+'npm" config set https-proxy '+config.proxy);
			shelljs.exec('git config --global http.proxy '+config.proxy);
			shelljs.exec('git config --global https.proxy '+config.proxy);
		};
		if (!config.alias) {
			var shortid=require('shortid');
			config.alias=shortid.generate();
			fs.writeFileSync(__dirname+path.sep+".."+path.sep+"config"+path.sep+"workers.json",JSON.stringify(config,null,4));
		};
		shelljs.exec('git config --global url."https://".insteadOf git://');
		shelljs.exec('cd "'+p+path.sep+'Contents" && "'+__dirname+path.sep+'nodejs'+path.sep+'bin'+path.sep+'npm" install git+http://github.com/Omneedia/api.git');
		shelljs.exec('cd "'+p+path.sep+'Contents" && "'+__dirname+path.sep+'nodejs'+path.sep+'bin'+path.sep+'npm" install git+http://github.com/Omneedia/authom.git');
		shelljs.exec('cd "'+p+path.sep+'Contents" && "'+__dirname+path.sep+'nodejs'+path.sep+'bin'+path.sep+'npm" install git+http://github.com/Omneedia/db.git');
		shelljs.exec('cd "'+p+path.sep+'Contents" && "'+__dirname+path.sep+'nodejs'+path.sep+'bin'+path.sep+'npm" install');
		var etc=JSON.parse(fs.readFileSync(contents+"etc"+path.sep+"settings-prod.json",'utf-8'));
		if (etc.remote) var url=etc.remote.app;
		if (url.indexOf('http://')>-1) url=url.split('http://')[1];
		var _dir="/etc/init/"+info_namespace+".conf";
		var _dir2="/etc/systemd/system/"+info_namespace+".service";
		var tpl=fs.readFileSync(__dirname+path.sep+".."+path.sep+"config"+path.sep+"service.template","utf-8");
		var tpl2=fs.readFileSync(__dirname+path.sep+".."+path.sep+"config"+path.sep+"systemd.template","utf-8");
		var pp=path.resolve(__dirname+path.sep+".."+path.sep+"drones");
		var str=__dirname+path.sep+"nodejs"+path.sep+"bin"+path.sep+"node \""+d+path.sep+"Contents"+path.sep+"worker.js\"";
		tpl=tpl.replace(/{DRONE.PATH}/g,str);
		tpl=tpl.replace(/{DRONE.NS}/g,info_namespace);
		tpl2=tpl2.replace(/{DRONE.PATH}/g,str);
		tpl2=tpl2.replace(/{DRONE.NS}/g,info_namespace);
		fs.writeFileSync(_dir,tpl);
		fs.writeFileSync(_dir2,tpl2);
		shelljs.exec('service '+info_namespace+' stop');
		shelljs.exec('systemctl daemon-reload');
		shelljs.mv(p+path.sep+"*",d);
		shelljs.rm('-rf',__dirname+path.sep+'..'+path.sep+"tmp"+path.sep+info_namespace);
		shelljs.exec('service '+info_namespace+' start');
		shelljs.rm(item);
	};

	var app = express();

	app.use(require('morgan')("dev"));
	app.use(require('cookie-parser')());
	app.use(require('body-parser').urlencoded({
		extended: true,
		limit: "5000mb"
	}));
	app.use(require('body-parser').json({
		limit: "5000mb"
	}));
	app.get('/',function(req,res) {
		var response={
			"omneedia" : OMNEEDIA
		};
		res.writeHead(200, {'Content-Type' : 'application/json','charset' : 'utf-8'});
		res.end(JSON.stringify(response,null,4));
		return;
	});
	app.get('/api',function(req,res) {
		res.writeHead(200, {'Content-Type' : 'application/json','charset' : 'utf-8'});
		res.end(JSON.stringify({omneedia: OMNEEDIA},null,4));
		return;
	});
	app.get('/stats',function(req,res){
		var pusage=require('pidusage');
		pusage.stat(process.pid, function(err, stat) {
			res.end(JSON.stringify(stat));
		});
	});

	var multer=require('multer');
	if (!fs.existsSync(__dirname+path.sep+'..'+path.sep+"tmp")) fs.mkdirSync(__dirname+path.sep+'..'+path.sep+"tmp");
    var storage = multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, __dirname+require('path').sep+'..'+require('path').sep+'tmp')
      },
      filename: function (req, file, cb) {
        cb(null, file.originalname)
      }
    });

    var UPLOAD = multer({ storage: storage })

	app.post('/upload',UPLOAD.single("file"),function(req,res,next){
		// Are you in my access list ?
			console.log('-----------');
			console.log(req.file);
			if(req.file){
				processFiles(req.file.path);
				res.end("File uploaded.");
			}
	});

	app.post('/sandbox',UPLOAD.single("file"),function(req,res,next){
		var path=require('path');
		var jsoconf=JSON.parse(fs.readFileSync(__dirname+path.sep+'..'+path.sep+'..'+path.sep+'Sandbox'+path.sep+'config'+path.sep+'sandbox.json'));
		shelljs.exec(__dirname+path.sep+'7z x "'+req.file.path+'" -o"'+__dirname+path.sep+'..'+path.sep+"tmp"+path.sep+req.file.path.split('snapshot.')[1]+'"');
		shelljs.rm(req.file.path);
		if (!fs.existsSync(__dirname+path.sep+'..'+path.sep+'..'+path.sep+'Sandbox'+path.sep+'var'+path.sep+req.body.pid)) fs.mkdirSync(__dirname+path.sep+'..'+path.sep+'..'+path.sep+'Sandbox'+path.sep+'var'+path.sep+req.body.pid); else {
			if (fs.existsSync(__dirname+path.sep+'..'+path.sep+'..'+path.sep+'Sandbox'+path.sep+'var'+path.sep+req.body.pid+path.sep+req.body.pkg)) shelljs.rm('-Rf',__dirname+path.sep+'..'+path.sep+'..'+path.sep+'Sandbox'+path.sep+'var'+path.sep+req.body.pid+path.sep+req.body.pkg);
		};
		shelljs.mv(__dirname+path.sep+'..'+path.sep+"tmp"+path.sep+req.file.path.split('snapshot.')[1]+path.sep+".tmp",__dirname+path.sep+'..'+path.sep+'..'+path.sep+'Sandbox'+path.sep+'var'+path.sep+req.body.pid+path.sep+req.body.pkg);
		process.chdir(__dirname+path.sep+'..'+path.sep+'..'+path.sep+'Sandbox'+path.sep+'var'+path.sep+req.body.pid+path.sep+req.body.pkg);
		console.log(__dirname+path.sep+'..'+path.sep+'..'+path.sep+'Sandbox'+path.sep+'var'+path.sep+req.body.pid+path.sep+req.body.pkg);
		shelljs.rm('-Rf',__dirname+path.sep+'..'+path.sep+"tmp"+path.sep+req.file.path.split('snapshot.')[1]);
		var uri=req.body.uri;
		var pkg=req.body.pkg;
		var prefix=req.body.pid;
		var path=require('path');
		var oa=__dirname+path.sep+'..'+path.sep+'..'+path.sep+'Sandbox'+path.sep+'bin'+path.sep+'oa';
		var ob=oa+" update --sandbox --user "+prefix+" --app "+pkg;
		shelljs.exec(ob,{silent: false});
		// on lance le process
		freeport(function(err,port) {
			var spawn = require('child_process').spawn;
			var prc = spawn('nohup',  [oa, 'start', '--port',port,'--app',pkg, '--sandbox','--user',prefix,'&>log','&']);
			var ofile=__dirname+path.sep+'..'+path.sep+'..'+path.sep+'Sandbox'+path.sep+'pids'+path.sep+prefix+'.'+pkg+'.inf';
			fs.writeFileSync(ofile,port+':XXX:'+prefix+'.'+pkg+'.'+jsoconf.domain);
			if (fs.existsSync(ofile)) ofile=fs.readFileSync(ofile,'utf-8').split(':');
			res.end('{"url":"'+ofile[2]+'","success": true}');
		});
	});

	app.enable('trust proxy');
	app.listen(Config.port);
}
