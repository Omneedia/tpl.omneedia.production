module.exports = function (app, authom, MSettings) {
	Auth = {
		user: function (profile, fn) {
			console.log(profile);
			Auth.login(profile, profile.service, function (response) {
				fn(null, response);
			});
		}
		, login: function (profile, auth_type, cb) {
			var off = "Officer";
			var fs = require('fs');
			var path = require('path');
			var Auth = require(__dirname + path.sep + ".." + path.sep + "auth" + path.sep + off + ".js");
			Auth.using = function (unit) {
				return require(__dirname + path.sep + ".." + path.sep + 'node_modules' + path.sep + unit);
			};
			Auth.getProfile = function (user, cb) {
				var response = [];
				if (cb) {
					fs.readFile(__dirname + path.sep + ".." + path.sep + "auth" + path.sep + 'Profiler.json', function (e, r) {
						var profiler = JSON.parse(r.toString('utf-8'));
						for (var el in profiler.profile) {
							var p = profiler.profile[el];
							if (p.indexOf(user) > -1) response.push(el);
						};
						cb(response);
					})
				}
				else {
					// DO NOT USE ANYMORE
					// DEPRECATED
					if (fs.existsSync(__dirname + path.sep + ".." + path.sep + "auth" + path.sep + 'Profiler.json')) {
						var profiler = JSON.parse(require('fs').readFileSync(__dirname + path.sep + ".." + path.sep + "auth" + path.sep + 'Profiler.json', 'utf-8'));
						for (var el in profiler.profile) {
							var p = profiler.profile[el];
							if (p.indexOf(user) > -1) response.push(el);
						};
					};
					return response;
				}
			};
			Auth.login(profile, auth_type, function (response) {
				cb(response);
			});
		}
	};
	/*app.get('/login', function (req, res) {
		res.setHeader('content-type', 'text/html');
		res.end('{}');
	});*/
	app.get('/bye', function (req, res) {
		res.setHeader('content-type', 'text/html');
		res.end('<script>top.location.reload(true);window.close();</script>');
	});
	app.get('/logout', function (req, res) {
		req.session.destroy();
		res.redirect('/bye');
	});

	function ensureAuthenticated(req, res, next) {
		if (!req.user) req.user = req.session.user;
		if (req.user) return next();
		res.end('{"response":"NOT_LOGIN"}');
	};
	app.get('/account', ensureAuthenticated, function (req, res) {
		console.log(req.session);
		if (!req.user) req.user = req.session.user;
		var response = [];
		fs.readFile(__dirname + path.sep + ".." + path.sep + "auth" + path.sep + 'Profiler.json', function (e, r) {
			if (e) return res.end(JSON.stringify(req.user));
			var profiler = JSON.parse(r.toString('utf-8'));
			for (var el in profiler.profile) {
				var p = profiler.profile[el];
				if (p.indexOf(req.user.mail.split('@')[0]) > -1) response.push(el);
			};
			req.user.profiles = response;
			res.end(JSON.stringify(req.user));
		});
	});
	app.post('/account', ensureAuthenticated, function (req, res) {
		console.log('*******************');
		/*if (req.body.udid) {
                // on récupère le udid crée côté client
                req.session.udid = new Buffer(req.body.udid, 'base64').toString('utf-8');
                req.session.device = req.session.udid.split('|')[1];
                req.session.uid = req.session.udid.split('|')[0];
                // on ajoute l'utilisateur pour créer le pudid (personal udid)
                req.session.user.pudid = new Buffer(req.session.uid + '|' + req.session.user.uid + '|' + req.session.device).toString('base64');
                req.session.udid = req.body.udid;
        };*/
		if (!req.user) req.user = req.session.user;
		var response = [];
		fs.readFile(__dirname + path.sep + ".." + path.sep + "auth" + path.sep + 'Profiler.json', function (e, r) {
			if (e) return res.end(JSON.stringify(req.user));
			var profiler = JSON.parse(r.toString('utf-8'));
			for (var el in profiler.profile) {
				var p = profiler.profile[el];
				if (p.indexOf(req.user.mail.split('@')[0]) > -1) response.push(el);
			};
			req.user.profiles = response;
			res.end(JSON.stringify(req.user));
		});
	});
	for (var el in MSettings.auth) {
		var config = MSettings.auth[el];
		config.service = el;
		authom.createServer(config);
	};
	authom.on("auth", function (req, res, data) {
		profile = data;
		//profile.provider = "google";
		Auth.user(profile, function (err, response) {
			req.session.user = response;
			res.setHeader('content-type', 'text/html');
			OASocketonAuth(JSON.stringify(response));
			res.end("<html><body><script>setTimeout(window.close, 1000);</script></body></html>");
		});
	});
	authom.on("error", function (req, res, data) {
		// called when an error occurs during authentication
		console.log(data);
	});
	app.get("/auth/:service", authom.app);
}
