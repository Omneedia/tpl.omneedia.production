module.exports = function(app,express) {
	var path = require('path');
	var _App = require(__dirname + path.sep + '..' + path.sep + 'var' + path.sep + "app.js");
    _App.tmpdir = function (filename) {
		return "/tmp/tempfiles";
    };
	_App.file={
		reader: function(ff,cb) {
			if (!ff.docId) cb("MISMATCHED_OBJECT", null);
			else {
				if (ff._blob) {
					if (ff._blob.indexOf(';base64')>-1) {
						var buf = new Buffer(ff._blob.split(';base64,')[1], 'base64');
						if (isFunction(cb)) {
							cb(null,buf);
						} else {
							if (cb.set) {
								cb.set('Content-disposition', 'inline; filename="'+ff.filename+'"');
								cb.set("Content-Type", ff.type);
								cb.set("Content-Length", ff.size);
								cb.end(buf);
							} else cb("MISMATCHED_CALLBACK_PROVIDED",null);
						};
					} else cb("MISMATCHED_OBJECT", null);
				} else cb("MISMATCHED_OBJECT", null);
			}
		}
	};
	_App.temp = function (ext) {
		var uid = Math.uuid();
		var dir = "/tmp" + path.sep+"tempfiles";
		fs.mkdir(dir,function() {});
		var filename = uid;
		if (ext) filename += "." + ext;
		return {
			uid: uid
			, filename: filename
			, dir: dir
			, path: dir + path.sep + filename
			, url: "/tmp/" + filename
		};
	};	
	_App.IO = {
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
    _App.using = function (unit) {
		return require(__dirname + path.sep + '..' + path.sep + 'node_modules' + path.sep + unit);
    };
    _App.api = require(__dirname + path.sep + '..' + path.sep + 'node_modules' + path.sep + "api");	
	
	var Manifest = global.manifest;
	for (var i = 0; i < Manifest.api.length; i++) {
		_App[Manifest.api[i]] = require(__dirname + path.sep + '..' + path.sep + 'api' + path.sep + Manifest.api[i] + '.js');
		var self = _App[Manifest.api[i]].model = {
			_model: {
				"type": "raw"
				, "metaData": {
					"idProperty": -1
					, "totalProperty": "total"
					, "successProperty": "success"
					, "root": "data"
					, "fields": []
				}
				, "total": 0
				, "data": []
				, "success": false
				, "message": "failure"
			}
			, init: function () {
				self._model.metaData.fields = [];
				self._model.data = [];
				self._model.success = false;
				self._model.message = "failure";
			}
			, fields: {
				add: function (o) {
					if (o === Object(o))
						self._model.metaData.fields.push(o);
					else {
						var t = o.split(',');
						if (t.length == 3) {
							var o = {
								name: t[0]
								, type: t[1]
								, length: t[2]
							};
						} else {
							var o = {
								name: o
								, type: 'string'
								, length: 255
							};
						};
						self._model.metaData.fields.push(o);
					}
				}
			}
			, data: {
				add: function (o) {
					self._model.data.push(o);
					self._model.total = self._model.data.length;
				}
			}
			, get: function () {
				self._model.success = true;
				self._model.message = "success";
				return self._model;
			}
		};
		_App[Manifest.api[i]].DB = require(__dirname + path.sep + '..' + path.sep + 'node_modules' + path.sep + "db" + path.sep + "DB.js");
		_App[Manifest.api[i]].IO = {
			send: function (uri, data, users) {
				var o = {
					uri: uri
					, data: data
					, users: users
				};
				var socket = require('socket.io-client')(global.registry.uri);
				if (uri.indexOf("#") > -1) socket.emit("#send", JSON.stringify(o));
			}
		};
		_App[Manifest.api[i]].using = function (unit) {
			return require(__dirname + path.sep + '..' + path.sep + 'node_modules' + path.sep + unit);
    	};
	
		_App.init(app, express);
	};
}