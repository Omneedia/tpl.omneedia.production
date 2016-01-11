
console.log('');
console.log('  omneedia Production Service started');
console.log('  -----------------------------------');
console.log('');

var fork = require('child_process').fork;

var cluster = require('cluster');
var numCPUs = require('os').cpus().length;

function decrypt(text){
	var crypto=require('crypto');
	var json=require('fs').readFileSync(__dirname+require('path').sep+'..'+require('path').sep+'registry.json');
	var Config = JSON.parse(json);
	try {
		var decipher = crypto.createDecipher('aes-256-cbc',Config.key)
		var dec = decipher.update(text,'hex','utf8')
		dec += decipher.final('utf8');
		return dec;
	}catch(e) {
		return -1;
	}
};

// read registry
if (!require('fs').existsSync(__dirname+require('path').sep+'..'+require('path').sep+'registry.json')) {
	console.log('');
	console.log('  ! registry not found');
	return;
} else
var reg=require('fs').readFileSync(__dirname+require('path').sep+'..'+require('path').sep+'registry.json','utf-8');
try {
	reg=JSON.parse(reg);
} catch(ex) {
	console.log(ex);
	console.log("  ! invalid registry");
	return;
};
if (cluster.isMaster) {
	// Fork workers.
	var wrench=require("wrench");
	var NS=__dirname.split(require('path').sep)[__dirname.split(require('path').sep).length-2];
	var path=require('path');
	try {
		wrench.rmdirSyncRecursive(__dirname+path.sep+".."+path.sep+".."+path.sep+"var"+path.sep+"pids"+path.sep+NS);
	}catch(ex){};  
	if (reg.threads) numCPUs=reg.threads;
	console.log('  - Forking '+reg.threads+' processes...');
	console.log('');
	var request=require('request');
	request.post('http://'+reg.cluster.split(':')[0]+':'+reg.cluster.split(':')[1]+'/session',{form: {}},function (error, response, body) {
		if (error) {
			console.log('  ! FATAL ERROR: Cluster '+reg.cluster+' not responding.');
			return;
		} else {
			var session=decrypt(body);
			if (session==-1) {
				console.log('  ! FATAL ERROR: Bad handshake, Cluster '+reg.cluster+' refused connection.');
				return;			
			};
			for (var i = 0; i < numCPUs; i++) {
				fork(__dirname+require('path').sep+'worker.js',[
					reg.cluster,
					session,
					reg.uri,
					i
				]);
			};			
		};
		
	});
	process.on('SIGTERM',function(){
		request.post('http://'+reg.cluster.split(':')[0]+':'+reg.cluster.split(':')[1]+'/stop',{form: {ns: NS}},function (error, response, body) {
			if (error) {
				console.log('  ! FATAL ERROR: Cluster '+reg.cluster+' not responding.');
				return;
			} else {
				console.log(body);
			}
			process.exit(1);
		});
        console.log('--> died');        
	});
	cluster.on('exit', function(worker, code, signal) {
		console.log('worker ' + worker.process.pid + ' died');
	});
} else {
	console.log('- Loading instance');
};
