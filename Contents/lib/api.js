module.exports = {
	processRoute(req, resp) {
		var fs = require('fs');
		var path = require('path');
		var root = __dirname+path.sep+'..';
		var parseFunction = require('parse-function') 
		var parser = parseFunction({
  			ecmaVersion: 2017
		});
		function process_api(d, i, batch, res) {
			if (!d[i]) return res.end(JSON.stringify(batch, 'utf8'));

			var api = d[i];
			try {
				var name = require.resolve(api.action);
				delete require.cache[name];
			} catch (e) {};
			if (api.action == "__QUERY__")
				var x = require(root + path.sep + "node_modules" + path.sep + "db" + path.sep + api.action + ".js");
			else
				var x = require(root + path.sep + "api" + path.sep + api.action + ".js");
			x.using = function (unit) {
				return require(root + path.sep + 'node_modules' + path.sep + unit);
			};
			// Upload
			x.getFile = function(filename,cb) {
				var uid = Math.uuid();
				var mongoose = require('mongoose');  
				var Grid = require('gridfs-stream');
				Grid.mongo = mongoose.mongo;
				var conn = mongoose.createConnection(global.reg_session + '/upload');
				conn.once('open', function () {
					var gfs = Grid(conn.db);
					var readstream = gfs.createReadStream({
						_id: filename
					});
					readstream.on('error', function (err) {
						cb(err,null);
					});
					var tmpfile="/tmp/"+uid;
					var filetmp=fs.createWriteStream(tmpfile);
					readstream.pipe(filetmp);
					readstream.on('end',function() {
						cb(tmpfile);
					});
				});					

			};
			x.temp = function (ext) {
				var uid = Math.uuid();
				var dir = "/tmp/tempfiles";
				fs.mkdir(dir,function() {
					var filename = uid;
					if (ext) filename += "." + ext;
					return {
						uid: uid
						, filename: filename
						, dir: dir
						, path: dir + path.sep + filename
						, url: "/tmp/" + filename
					};					
				})
			};
			// Sockets API
			x.IO = {
				send: function (uri, data, users) {
					var o = {
						uri: uri
						, data: data
						, users: users
					};
					var socket = require('socket.io-client')('http://' + global.registry.uri);
					if (uri.indexOf("#") > -1) socket.emit("#send", JSON.stringify(o));
				}
			};
			var myfn = parser.parse(x[api.method]);
			/*var myfn = x[api.method].toString().split('function')[1].split('{')[0].trim().split('(')[1].split(')')[0].split(',');*/
			var response = {};
			response.params = myfn.args;
			/*for (var j = 0; j < myfn.length; j++) {
				if (myfn[j].trim() != "") response.params[response.params.length] = myfn[j].trim();
			};*/
			var p = [];
			for (var e = 0; e < response.params.length - 1; e++) {
				p.push(api.data[e]);
			};
			p.push(function (err, response) {
				if (err) {
					batch.push({
						action: api.action
						, method: api.method
						, result: response
						, message: err.message
						, data: err
						, tid: api.tid
						, type: "rpc"
					});
				} else {
					err = null;
					batch.push({
						action: api.action
						, method: api.method
						, result: response
						, tid: api.tid
						, type: "rpc"
					});
				};
				process_api(d, i + 1, batch, res);
			});
			try {
				x[api.method].apply({}, p);
			} catch (e) {
				batch.push({
					type: 'exception'
					, action: api.action
					, method: api.method
					, message: e.message
					, data: e
				});
				process_api(d, i + 1, batch, res);
			}

		};
		
        var data = req.body;
        var d = [];
        if (data instanceof Array) {
            d = data;
        } else {
            d.push(data);
        };
        process_api(d, 0, [], resp);
    }
}