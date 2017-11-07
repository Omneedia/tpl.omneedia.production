module.exports = function(app) {
	
	var authom = require("@omneedia/authom");
	var fs = require('fs');
	var path = require('path');
	var sep = "/";
	
	var util = require('../util');

	global.Auth = {
		user: function (profile, fn) {
			Auth.login(profile, profile.service,function (response) {
				fn(null, response);
			});
		}, 
		login: function (profile, auth_type, cb) {
			var off = "Officer";
			var fs = require('fs');
			var path = require('path');
			var Auth = require(global.PROJECT_AUTH + sep +  off + ".js");
			Auth.using = function (unit) {
				//built in classes
				if (unit=="db") return require(global.ROOT+sep+'node_modules'+sep+'@omneedia'+sep+'db'+sep+'lib'+sep+'index.js');
				try {
					return require(global.ROOT + sep + 'node_modules' + sep + unit);			
				} catch(e) {
					return require(global.PROJECT_BIN + sep + 'node_modules' + sep + unit);
				};
			};
			Auth.getProfile = function (user,cb) {
				var response = [];
				if (cb) {
					fs.readFile(global.PROJECT_AUTH + sep + 'Profiler.json', function(e,r) {
						var profiler = JSON.parse(r.toString('utf-8'));
						for (var el in profiler.profile) {
							var p = profiler.profile[el];
							if (p.indexOf(user) > -1) response.push(el);
						};
						cb(response);
					})
				} else {
					// DO NOT USE ANYMORE
					// WILL BE DEPRECATED
					if (fs.existsSync(global.PROJECT_AUTH + sep + 'Profiler.json')) {
						var profiler = JSON.parse(require('fs').readFileSync(global.PROJECT_AUTH + sep + 'Profiler.json', 'utf-8'));
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
		if (!req.user) req.user = req.session.user;
		var response = [];
		fs.readFile(global.PROJECT_AUTH + sep + 'Profiler.json',function(e,r) {
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
    	
		if (!req.user) req.user = req.session.user;
        var response = [];
				
		fs.readFile(global.PROJECT_AUTH + sep + 'Profiler.json',function(e,r) {
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

	for (var el in global.settings.auth) {
		var o=global.settings.auth[el];
		o.service=el;
		authom.createServer(o);
	};

	authom.on("auth", function (req, res, data) {
		profile = data;
		Auth.user(profile, function (err, response) {
			req.session.user = response;
			global.OASocketonAuth(JSON.stringify(response));
			res.end("<html><body><script>setTimeout(window.close, 1000);</script></body></html>");
		});
	});
	
	authom.on("error", function (req, res, data) {
		// called when an error occurs during authentication
		console.log('-- ERROR ------');
		console.log(data);
	});
	
	app.get("/auth/:service", authom.app);
	
}
