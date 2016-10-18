/**
 *
 *	Omneedia Worker Foundation
 *	v 0.9.8n
 *
 * 	29/03/2016	Changed MongoDB to REDIS for socket.io		v 0.9.7b
 * 	11/10/2016	MongoDB is the default engine for sessions,socketio, upload (drop REDIS)
 *
 **/

$_VERSION = "0.9.8n";
$_DEBUG = true;

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
var wrench = require('wrench');
var numCPUs = require('os').cpus().length;
var networkInterfaces = require('os').networkInterfaces();

// read Registry  
var registry = JSON.parse(require('fs').readFileSync(__dirname + require('path').sep + '..' + require('path').sep + 'registry.json'));

// read app.manifest
var json = fs.readFileSync(__dirname + path.sep + "app.manifest");
Manifest = JSON.parse(json);

var IP = [];
for (var e in networkInterfaces) {
    IP.push(networkInterfaces[e][0].address);
};

Math.uuid = function () {
	var CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');
	var chars = CHARS
		, uuid = new Array(36)
		, rnd = 0
		, r;
	for (var i = 0; i < 36; i++) {
		if (i == 8 || i == 13 || i == 18 || i == 23) {
			uuid[i] = '-';
		} else if (i == 14) {
			uuid[i] = '4';
		} else {
			if (rnd <= 0x02) rnd = 0x2000000 + (Math.random() * 0x1000000) | 0;
			r = rnd & 0xf;
			rnd = rnd >> 4;
			uuid[i] = chars[(i == 19) ? (r & 0x3) | 0x8 : r];
		}
	}
	return uuid.join('');
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

var IP = "";

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

if (registry.threads != "*") numCPUs = registry.threads * 1;

if (cluster.isMaster) {
    console.log('');
    freeport(function (err, ip) {
        IP = ip;
        console.log('Omneedia Worker started at ' + getIPAddress() + ":" + ip + " (" + numCPUs + " threads)");
        var workers = [];

        // Helper function for spawning worker at index 'i'.
        var spawn = function (i) {
            workers[i] = cluster.fork();
            workers[i].on('exit', function (worker, code, signal) {
                console.log('respawning worker', i);
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
            console.log(connection.remoteAddress);
            worker.send('sticky-session:connection', connection);
        }).listen(ip);
        
        var cluster_host = registry.cluster.split(':')[0];
        if (registry.cluster.split(':').length > 1) var cluster_port = registry.cluster.split(':')[1];
        else var cluster_port = 80;
		        
		console.log("Connecting to cluster " + 'http://' + cluster_host + ':' + cluster_port);
        var socket = require('socket.io-client')('http://' + cluster_host + ':' + cluster_port);
        socket.on('disconnect', function () {
            console.log("Loosing cluster...");
        });
        socket.on('connect', function () {
            console.log('Cluster Connected');
            //freeport(function (er, port) {
            console.log('Listening to port ' + IP);
			
            // register port with cluster
    		
			var NS = __dirname.split(path.sep)[__dirname.split(path.sep).length - 3];
    		var _NS = "/" + NS;
			
            var wrench = require('wrench');
            wrench.mkdirSyncRecursive(__dirname + path.sep + ".." + path.sep + ".." + path.sep + "var" + path.sep + "pids" + path.sep + NS, 0777);
            console.log("Worker thread " + NS + " started at " + getIPAddress() + ":" + IP + " - pid: " + process.pid + "\n");

            //http.listen(port);
            fs.writeFileSync(__dirname + path.sep + ".." + path.sep + ".." + path.sep + "var" + path.sep + "pids" + path.sep + NS + path.sep + process.pid + ".pid", IP);
            console.log('registering drone...');
            // update cluster
			if (registry.alias) var alias=' '+registry.alias; else alias="";
            socket.emit('ONLINE', {
                drone: Manifest.namespace
                , host: getIPAddress()
                , port: IP
                , pid: process.pid
                , uri: registry.uri+alias
            });
            socket.on('REGISTER', function () {
                console.log('registered.');
            });

            //});

        });
        socket.on('event', function (data) {


        });
        socket.on('disconnect', function () {

        });
    });

} else {

    //console.log("- thread started.");

    if (fs.existsSync(__dirname + path.sep + 'etc' + path.sep + 'settings-prod.json')) {
        var _set = fs.readFileSync(__dirname + path.sep + 'etc' + path.sep + 'settings-prod.json', 'utf-8');
        MSettings = JSON.parse(_set);
    };

    /**
     * @version: 1.0 Alpha-1
     * @author: Coolite Inc. http://www.coolite.com/
     * @date: 2008-05-13
     * @copyright: Copyright (c) 2006-2008, Coolite Inc. (http://www.coolite.com/). All rights reserved.
     * @license: Licensed under The MIT License. See license.txt and http://www.datejs.com/license/. 
     * @website: http://www.datejs.com/
     */
    Date.CultureInfo = {
        name: "en-US"
        , englishName: "English (United States)"
        , nativeName: "English (United States)"
        , dayNames: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        , abbreviatedDayNames: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        , shortestDayNames: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
        , firstLetterDayNames: ["S", "M", "T", "W", "T", "F", "S"]
        , monthNames: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
        , abbreviatedMonthNames: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        , amDesignator: "AM"
        , pmDesignator: "PM"
        , firstDayOfWeek: 0
        , twoDigitYearMax: 2029
        , dateElementOrder: "mdy"
        , formatPatterns: {
            shortDate: "M/d/yyyy"
            , longDate: "dddd, MMMM dd, yyyy"
            , shortTime: "h:mm tt"
            , longTime: "h:mm:ss tt"
            , fullDateTime: "dddd, MMMM dd, yyyy h:mm:ss tt"
            , sortableDateTime: "yyyy-MM-ddTHH:mm:ss"
            , universalSortableDateTime: "yyyy-MM-dd HH:mm:ssZ"
            , rfc1123: "ddd, dd MMM yyyy HH:mm:ss GMT"
            , monthDay: "MMMM dd"
            , yearMonth: "MMMM, yyyy"
        }
        , regexPatterns: {
            jan: /^jan(uary)?/i
            , feb: /^feb(ruary)?/i
            , mar: /^mar(ch)?/i
            , apr: /^apr(il)?/i
            , may: /^may/i
            , jun: /^jun(e)?/i
            , jul: /^jul(y)?/i
            , aug: /^aug(ust)?/i
            , sep: /^sep(t(ember)?)?/i
            , oct: /^oct(ober)?/i
            , nov: /^nov(ember)?/i
            , dec: /^dec(ember)?/i
            , sun: /^su(n(day)?)?/i
            , mon: /^mo(n(day)?)?/i
            , tue: /^tu(e(s(day)?)?)?/i
            , wed: /^we(d(nesday)?)?/i
            , thu: /^th(u(r(s(day)?)?)?)?/i
            , fri: /^fr(i(day)?)?/i
            , sat: /^sa(t(urday)?)?/i
            , future: /^next/i
            , past: /^last|past|prev(ious)?/i
            , add: /^(\+|aft(er)?|from|hence)/i
            , subtract: /^(\-|bef(ore)?|ago)/i
            , yesterday: /^yes(terday)?/i
            , today: /^t(od(ay)?)?/i
            , tomorrow: /^tom(orrow)?/i
            , now: /^n(ow)?/i
            , millisecond: /^ms|milli(second)?s?/i
            , second: /^sec(ond)?s?/i
            , minute: /^mn|min(ute)?s?/i
            , hour: /^h(our)?s?/i
            , week: /^w(eek)?s?/i
            , month: /^m(onth)?s?/i
            , day: /^d(ay)?s?/i
            , year: /^y(ear)?s?/i
            , shortMeridian: /^(a|p)/i
            , longMeridian: /^(a\.?m?\.?|p\.?m?\.?)/i
            , timezone: /^((e(s|d)t|c(s|d)t|m(s|d)t|p(s|d)t)|((gmt)?\s*(\+|\-)\s*\d\d\d\d?)|gmt|utc)/i
            , ordinalSuffix: /^\s*(st|nd|rd|th)/i
            , timeContext: /^\s*(\:|a(?!u|p)|p)/i
        }
        , timezones: [{
            name: "UTC"
            , offset: "-000"
    }, {
            name: "GMT"
            , offset: "-000"
    }, {
            name: "EST"
            , offset: "-0500"
    }, {
            name: "EDT"
            , offset: "-0400"
    }, {
            name: "CST"
            , offset: "-0600"
    }, {
            name: "CDT"
            , offset: "-0500"
    }, {
            name: "MST"
            , offset: "-0700"
    }, {
            name: "MDT"
            , offset: "-0600"
    }, {
            name: "PST"
            , offset: "-0800"
    }, {
            name: "PDT"
            , offset: "-0700"
    }]
    };
    (function () {
        var $D = Date
            , $P = $D.prototype
            , $C = $D.CultureInfo
            , p = function (s, l) {
                if (!l) {
                    l = 2;
                }
                return ("000" + s).slice(l * -1);
            };
        $P.clearTime = function () {
            this.setHours(0);
            this.setMinutes(0);
            this.setSeconds(0);
            this.setMilliseconds(0);
            return this;
        };
        $P.setTimeToNow = function () {
            var n = new Date();
            this.setHours(n.getHours());
            this.setMinutes(n.getMinutes());
            this.setSeconds(n.getSeconds());
            this.setMilliseconds(n.getMilliseconds());
            return this;
        };
        $D.today = function () {
            return new Date().clearTime();
        };
        $D.compare = function (date1, date2) {
            if (isNaN(date1) || isNaN(date2)) {
                throw new Error(date1 + " - " + date2);
            } else if (date1 instanceof Date && date2 instanceof Date) {
                return (date1 < date2) ? -1 : (date1 > date2) ? 1 : 0;
            } else {
                throw new TypeError(date1 + " - " + date2);
            }
        };
        $D.equals = function (date1, date2) {
            return (date1.compareTo(date2) === 0);
        };
        $D.getDayNumberFromName = function (name) {
            var n = $C.dayNames
                , m = $C.abbreviatedDayNames
                , o = $C.shortestDayNames
                , s = name.toLowerCase();
            for (var i = 0; i < n.length; i++) {
                if (n[i].toLowerCase() == s || m[i].toLowerCase() == s || o[i].toLowerCase() == s) {
                    return i;
                }
            }
            return -1;
        };
        $D.getMonthNumberFromName = function (name) {
            var n = $C.monthNames
                , m = $C.abbreviatedMonthNames
                , s = name.toLowerCase();
            for (var i = 0; i < n.length; i++) {
                if (n[i].toLowerCase() == s || m[i].toLowerCase() == s) {
                    return i;
                }
            }
            return -1;
        };
        $D.isLeapYear = function (year) {
            return ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0);
        };
        $D.getDaysInMonth = function (year, month) {
            return [31, ($D.isLeapYear(year) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
        };
        $D.getTimezoneAbbreviation = function (offset) {
            var z = $C.timezones
                , p;
            for (var i = 0; i < z.length; i++) {
                if (z[i].offset === offset) {
                    return z[i].name;
                }
            }
            return null;
        };
        $D.getTimezoneOffset = function (name) {
            var z = $C.timezones
                , p;
            for (var i = 0; i < z.length; i++) {
                if (z[i].name === name.toUpperCase()) {
                    return z[i].offset;
                }
            }
            return null;
        };
        $P.clone = function () {
            return new Date(this.getTime());
        };
        $P.compareTo = function (date) {
            return Date.compare(this, date);
        };
        $P.equals = function (date) {
            return Date.equals(this, date || new Date());
        };
        $P.between = function (start, end) {
            return this.getTime() >= start.getTime() && this.getTime() <= end.getTime();
        };
        $P.isAfter = function (date) {
            return this.compareTo(date || new Date()) === 1;
        };
        $P.isBefore = function (date) {
            return (this.compareTo(date || new Date()) === -1);
        };
        $P.isToday = function () {
            return this.isSameDay(new Date());
        };
        $P.isSameDay = function (date) {
            return this.clone().clearTime().equals(date.clone().clearTime());
        };
        $P.addMilliseconds = function (value) {
            this.setMilliseconds(this.getMilliseconds() + value);
            return this;
        };
        $P.addSeconds = function (value) {
            return this.addMilliseconds(value * 1000);
        };
        $P.addMinutes = function (value) {
            return this.addMilliseconds(value * 60000);
        };
        $P.addHours = function (value) {
            return this.addMilliseconds(value * 3600000);
        };
        $P.addDays = function (value) {
            this.setDate(this.getDate() + value);
            return this;
        };
        $P.addWeeks = function (value) {
            return this.addDays(value * 7);
        };
        $P.addMonths = function (value) {
            var n = this.getDate();
            this.setDate(1);
            this.setMonth(this.getMonth() + value);
            this.setDate(Math.min(n, $D.getDaysInMonth(this.getFullYear(), this.getMonth())));
            return this;
        };
        $P.addYears = function (value) {
            return this.addMonths(value * 12);
        };
        $P.add = function (config) {
            if (typeof config == "number") {
                this._orient = config;
                return this;
            }
            var x = config;
            if (x.milliseconds) {
                this.addMilliseconds(x.milliseconds);
            }
            if (x.seconds) {
                this.addSeconds(x.seconds);
            }
            if (x.minutes) {
                this.addMinutes(x.minutes);
            }
            if (x.hours) {
                this.addHours(x.hours);
            }
            if (x.weeks) {
                this.addWeeks(x.weeks);
            }
            if (x.months) {
                this.addMonths(x.months);
            }
            if (x.years) {
                this.addYears(x.years);
            }
            if (x.days) {
                this.addDays(x.days);
            }
            return this;
        };
        var $y, $m, $d;
        $P.getWeek = function () {
            var a, b, c, d, e, f, g, n, s, w;
            $y = (!$y) ? this.getFullYear() : $y;
            $m = (!$m) ? this.getMonth() + 1 : $m;
            $d = (!$d) ? this.getDate() : $d;
            if ($m <= 2) {
                a = $y - 1;
                b = (a / 4 | 0) - (a / 100 | 0) + (a / 400 | 0);
                c = ((a - 1) / 4 | 0) - ((a - 1) / 100 | 0) + ((a - 1) / 400 | 0);
                s = b - c;
                e = 0;
                f = $d - 1 + (31 * ($m - 1));
            } else {
                a = $y;
                b = (a / 4 | 0) - (a / 100 | 0) + (a / 400 | 0);
                c = ((a - 1) / 4 | 0) - ((a - 1) / 100 | 0) + ((a - 1) / 400 | 0);
                s = b - c;
                e = s + 1;
                f = $d + ((153 * ($m - 3) + 2) / 5) + 58 + s;
            }
            g = (a + b) % 7;
            d = (f + g - e) % 7;
            n = (f + 3 - d) | 0;
            if (n < 0) {
                w = 53 - ((g - s) / 5 | 0);
            } else if (n > 364 + s) {
                w = 1;
            } else {
                w = (n / 7 | 0) + 1;
            }
            $y = $m = $d = null;
            return w;
        };
        $P.getISOWeek = function () {
            $y = this.getUTCFullYear();
            $m = this.getUTCMonth() + 1;
            $d = this.getUTCDate();
            return p(this.getWeek());
        };
        $P.setWeek = function (n) {
            return this.moveToDayOfWeek(1).addWeeks(n - this.getWeek());
        };
        $D._validate = function (n, min, max, name) {
            if (typeof n == "undefined") {
                return false;
            } else if (typeof n != "number") {
                throw new TypeError(n + " is not a Number.");
            } else if (n < min || n > max) {
                throw new RangeError(n + " is not a valid value for " + name + ".");
            }
            return true;
        };
        $D.validateMillisecond = function (value) {
            return $D._validate(value, 0, 999, "millisecond");
        };
        $D.validateSecond = function (value) {
            return $D._validate(value, 0, 59, "second");
        };
        $D.validateMinute = function (value) {
            return $D._validate(value, 0, 59, "minute");
        };
        $D.validateHour = function (value) {
            return $D._validate(value, 0, 23, "hour");
        };
        $D.validateDay = function (value, year, month) {
            return $D._validate(value, 1, $D.getDaysInMonth(year, month), "day");
        };
        $D.validateMonth = function (value) {
            return $D._validate(value, 0, 11, "month");
        };
        $D.validateYear = function (value) {
            return $D._validate(value, 0, 9999, "year");
        };
        $P.set = function (config) {
            if ($D.validateMillisecond(config.millisecond)) {
                this.addMilliseconds(config.millisecond - this.getMilliseconds());
            }
            if ($D.validateSecond(config.second)) {
                this.addSeconds(config.second - this.getSeconds());
            }
            if ($D.validateMinute(config.minute)) {
                this.addMinutes(config.minute - this.getMinutes());
            }
            if ($D.validateHour(config.hour)) {
                this.addHours(config.hour - this.getHours());
            }
            if ($D.validateMonth(config.month)) {
                this.addMonths(config.month - this.getMonth());
            }
            if ($D.validateYear(config.year)) {
                this.addYears(config.year - this.getFullYear());
            }
            if ($D.validateDay(config.day, this.getFullYear(), this.getMonth())) {
                this.addDays(config.day - this.getDate());
            }
            if (config.timezone) {
                this.setTimezone(config.timezone);
            }
            if (config.timezoneOffset) {
                this.setTimezoneOffset(config.timezoneOffset);
            }
            if (config.week && $D._validate(config.week, 0, 53, "week")) {
                this.setWeek(config.week);
            }
            return this;
        };
        $P.moveToFirstDayOfMonth = function () {
            return this.set({
                day: 1
            });
        };
        $P.moveToLastDayOfMonth = function () {
            return this.set({
                day: $D.getDaysInMonth(this.getFullYear(), this.getMonth())
            });
        };
        $P.moveToNthOccurrence = function (dayOfWeek, occurrence) {
            var shift = 0;
            if (occurrence > 0) {
                shift = occurrence - 1;
            } else if (occurrence === -1) {
                this.moveToLastDayOfMonth();
                if (this.getDay() !== dayOfWeek) {
                    this.moveToDayOfWeek(dayOfWeek, -1);
                }
                return this;
            }
            return this.moveToFirstDayOfMonth().addDays(-1).moveToDayOfWeek(dayOfWeek, +1).addWeeks(shift);
        };
        $P.moveToDayOfWeek = function (dayOfWeek, orient) {
            var diff = (dayOfWeek - this.getDay() + 7 * (orient || +1)) % 7;
            return this.addDays((diff === 0) ? diff += 7 * (orient || +1) : diff);
        };
        $P.moveToMonth = function (month, orient) {
            var diff = (month - this.getMonth() + 12 * (orient || +1)) % 12;
            return this.addMonths((diff === 0) ? diff += 12 * (orient || +1) : diff);
        };
        $P.getOrdinalNumber = function () {
            return Math.ceil((this.clone().clearTime() - new Date(this.getFullYear(), 0, 1)) / 86400000) + 1;
        };
        $P.getTimezone = function () {
            return $D.getTimezoneAbbreviation(this.getUTCOffset());
        };
        $P.setTimezoneOffset = function (offset) {
            var here = this.getTimezoneOffset()
                , there = Number(offset) * -6 / 10;
            return this.addMinutes(there - here);
        };
        $P.setTimezone = function (offset) {
            return this.setTimezoneOffset($D.getTimezoneOffset(offset));
        };
        $P.hasDaylightSavingTime = function () {
            return (Date.today().set({
                month: 0
                , day: 1
            }).getTimezoneOffset() !== Date.today().set({
                month: 6
                , day: 1
            }).getTimezoneOffset());
        };
        $P.isDaylightSavingTime = function () {
            return (this.hasDaylightSavingTime() && new Date().getTimezoneOffset() === Date.today().set({
                month: 6
                , day: 1
            }).getTimezoneOffset());
        };
        $P.getUTCOffset = function () {
            var n = this.getTimezoneOffset() * -10 / 6
                , r;
            if (n < 0) {
                r = (n - 10000).toString();
                return r.charAt(0) + r.substr(2);
            } else {
                r = (n + 10000).toString();
                return "+" + r.substr(1);
            }
        };
        $P.getElapsed = function (date) {
            return (date || new Date()) - this;
        };
        if (!$P.toISOString) {
            $P.toISOString = function () {
                function f(n) {
                    return n < 10 ? '0' + n : n;
                }
                return '"' + this.getUTCFullYear() + '-' +
                    f(this.getUTCMonth() + 1) + '-' +
                    f(this.getUTCDate()) + 'T' +
                    f(this.getUTCHours()) + ':' +
                    f(this.getUTCMinutes()) + ':' +
                    f(this.getUTCSeconds()) + 'Z"';
            };
        }
        $P._toString = $P.toString;
        $P.toString = function (format) {
            var x = this;
            if (format && format.length == 1) {
                var c = $C.formatPatterns;
                x.t = x.toString;
                switch (format) {
                case "d":
                    return x.t(c.shortDate);
                case "D":
                    return x.t(c.longDate);
                case "F":
                    return x.t(c.fullDateTime);
                case "m":
                    return x.t(c.monthDay);
                case "r":
                    return x.t(c.rfc1123);
                case "s":
                    return x.t(c.sortableDateTime);
                case "t":
                    return x.t(c.shortTime);
                case "T":
                    return x.t(c.longTime);
                case "u":
                    return x.t(c.universalSortableDateTime);
                case "y":
                    return x.t(c.yearMonth);
                }
            }
            var ord = function (n) {
                switch (n * 1) {
                case 1:
                case 21:
                case 31:
                    return "st";
                case 2:
                case 22:
                    return "nd";
                case 3:
                case 23:
                    return "rd";
                default:
                    return "th";
                }
            };
            return format ? format.replace(/(\\)?(dd?d?d?|MM?M?M?|yy?y?y?|hh?|HH?|mm?|ss?|tt?|S)/g, function (m) {
                if (m.charAt(0) === "\\") {
                    return m.replace("\\", "");
                }
                x.h = x.getHours;
                switch (m) {
                case "hh":
                    return p(x.h() < 13 ? (x.h() === 0 ? 12 : x.h()) : (x.h() - 12));
                case "h":
                    return x.h() < 13 ? (x.h() === 0 ? 12 : x.h()) : (x.h() - 12);
                case "HH":
                    return p(x.h());
                case "H":
                    return x.h();
                case "mm":
                    return p(x.getMinutes());
                case "m":
                    return x.getMinutes();
                case "ss":
                    return p(x.getSeconds());
                case "s":
                    return x.getSeconds();
                case "yyyy":
                    return p(x.getFullYear(), 4);
                case "yy":
                    return p(x.getFullYear());
                case "dddd":
                    return $C.dayNames[x.getDay()];
                case "ddd":
                    return $C.abbreviatedDayNames[x.getDay()];
                case "dd":
                    return p(x.getDate());
                case "d":
                    return x.getDate();
                case "MMMM":
                    return $C.monthNames[x.getMonth()];
                case "MMM":
                    return $C.abbreviatedMonthNames[x.getMonth()];
                case "MM":
                    return p((x.getMonth() + 1));
                case "M":
                    return x.getMonth() + 1;
                case "t":
                    return x.h() < 12 ? $C.amDesignator.substring(0, 1) : $C.pmDesignator.substring(0, 1);
                case "tt":
                    return x.h() < 12 ? $C.amDesignator : $C.pmDesignator;
                case "S":
                    return ord(x.getDate());
                default:
                    return m;
                }
            }) : this._toString();
        };
    }());
    (function () {
        var $D = Date
            , $P = $D.prototype
            , $C = $D.CultureInfo
            , $N = Number.prototype;
        $P._orient = +1;
        $P._nth = null;
        $P._is = false;
        $P._same = false;
        $P._isSecond = false;
        $N._dateElement = "day";
        $P.next = function () {
            this._orient = +1;
            return this;
        };
        $D.next = function () {
            return $D.today().next();
        };
        $P.last = $P.prev = $P.previous = function () {
            this._orient = -1;
            return this;
        };
        $D.last = $D.prev = $D.previous = function () {
            return $D.today().last();
        };
        $P.is = function () {
            this._is = true;
            return this;
        };
        $P.same = function () {
            this._same = true;
            this._isSecond = false;
            return this;
        };
        $P.today = function () {
            return this.same().day();
        };
        $P.weekday = function () {
            if (this._is) {
                this._is = false;
                return (!this.is().sat() && !this.is().sun());
            }
            return false;
        };
        $P.at = function (time) {
            return (typeof time === "string") ? $D.parse(this.toString("d") + " " + time) : this.set(time);
        };
        $N.fromNow = $N.after = function (date) {
            var c = {};
            c[this._dateElement] = this;
            return ((!date) ? new Date() : date.clone()).add(c);
        };
        $N.ago = $N.before = function (date) {
            var c = {};
            c[this._dateElement] = this * -1;
            return ((!date) ? new Date() : date.clone()).add(c);
        };
        var dx = ("sunday monday tuesday wednesday thursday friday saturday").split(/\s/)
            , mx = ("january february march april may june july august september october november december").split(/\s/)
            , px = ("Millisecond Second Minute Hour Day Week Month Year").split(/\s/)
            , pxf = ("Milliseconds Seconds Minutes Hours Date Week Month FullYear").split(/\s/)
            , nth = ("final first second third fourth fifth").split(/\s/)
            , de;
        $P.toObject = function () {
            var o = {};
            for (var i = 0; i < px.length; i++) {
                o[px[i].toLowerCase()] = this["get" + pxf[i]]();
            }
            return o;
        };
        $D.fromObject = function (config) {
            config.week = null;
            return Date.today().set(config);
        };
        var df = function (n) {
            return function () {
                if (this._is) {
                    this._is = false;
                    return this.getDay() == n;
                }
                if (this._nth !== null) {
                    if (this._isSecond) {
                        this.addSeconds(this._orient * -1);
                    }
                    this._isSecond = false;
                    var ntemp = this._nth;
                    this._nth = null;
                    var temp = this.clone().moveToLastDayOfMonth();
                    this.moveToNthOccurrence(n, ntemp);
                    if (this > temp) {
                        throw new RangeError($D.getDayName(n) + " does not occur " + ntemp + " times in the month of " + $D.getMonthName(temp.getMonth()) + " " + temp.getFullYear() + ".");
                    }
                    return this;
                }
                return this.moveToDayOfWeek(n, this._orient);
            };
        };
        var sdf = function (n) {
            return function () {
                var t = $D.today()
                    , shift = n - t.getDay();
                if (n === 0 && $C.firstDayOfWeek === 1 && t.getDay() !== 0) {
                    shift = shift + 7;
                }
                return t.addDays(shift);
            };
        };
        for (var i = 0; i < dx.length; i++) {
            $D[dx[i].toUpperCase()] = $D[dx[i].toUpperCase().substring(0, 3)] = i;
            $D[dx[i]] = $D[dx[i].substring(0, 3)] = sdf(i);
            $P[dx[i]] = $P[dx[i].substring(0, 3)] = df(i);
        }
        var mf = function (n) {
            return function () {
                if (this._is) {
                    this._is = false;
                    return this.getMonth() === n;
                }
                return this.moveToMonth(n, this._orient);
            };
        };
        var smf = function (n) {
            return function () {
                return $D.today().set({
                    month: n
                    , day: 1
                });
            };
        };
        for (var j = 0; j < mx.length; j++) {
            $D[mx[j].toUpperCase()] = $D[mx[j].toUpperCase().substring(0, 3)] = j;
            $D[mx[j]] = $D[mx[j].substring(0, 3)] = smf(j);
            $P[mx[j]] = $P[mx[j].substring(0, 3)] = mf(j);
        }
        var ef = function (j) {
            return function () {
                if (this._isSecond) {
                    this._isSecond = false;
                    return this;
                }
                if (this._same) {
                    this._same = this._is = false;
                    var o1 = this.toObject()
                        , o2 = (arguments[0] || new Date()).toObject()
                        , v = ""
                        , k = j.toLowerCase();
                    for (var m = (px.length - 1); m > -1; m--) {
                        v = px[m].toLowerCase();
                        if (o1[v] != o2[v]) {
                            return false;
                        }
                        if (k == v) {
                            break;
                        }
                    }
                    return true;
                }
                if (j.substring(j.length - 1) != "s") {
                    j += "s";
                }
                return this["add" + j](this._orient);
            };
        };
        var nf = function (n) {
            return function () {
                this._dateElement = n;
                return this;
            };
        };
        for (var k = 0; k < px.length; k++) {
            de = px[k].toLowerCase();
            $P[de] = $P[de + "s"] = ef(px[k]);
            $N[de] = $N[de + "s"] = nf(de);
        }
        $P._ss = ef("Second");
        var nthfn = function (n) {
            return function (dayOfWeek) {
                if (this._same) {
                    return this._ss(arguments[0]);
                }
                if (dayOfWeek || dayOfWeek === 0) {
                    return this.moveToNthOccurrence(dayOfWeek, n);
                }
                this._nth = n;
                if (n === 2 && (dayOfWeek === undefined || dayOfWeek === null)) {
                    this._isSecond = true;
                    return this.addSeconds(this._orient);
                }
                return this;
            };
        };
        for (var l = 0; l < nth.length; l++) {
            $P[nth[l]] = (l === 0) ? nthfn(-1) : nthfn(l);
        }
    }());
    (function () {
        Date.Parsing = {
            Exception: function (s) {
                this.message = "Parse error at '" + s.substring(0, 10) + " ...'";
            }
        };
        var $P = Date.Parsing;
        var _ = $P.Operators = {
            rtoken: function (r) {
                return function (s) {
                    var mx = s.match(r);
                    if (mx) {
                        return ([mx[0], s.substring(mx[0].length)]);
                    } else {
                        throw new $P.Exception(s);
                    }
                };
            }
            , token: function (s) {
                return function (s) {
                    return _.rtoken(new RegExp("^\s*" + s + "\s*"))(s);
                };
            }
            , stoken: function (s) {
                return _.rtoken(new RegExp("^" + s));
            }
            , until: function (p) {
                return function (s) {
                    var qx = []
                        , rx = null;
                    while (s.length) {
                        try {
                            rx = p.call(this, s);
                        } catch (e) {
                            qx.push(rx[0]);
                            s = rx[1];
                            continue;
                        }
                        break;
                    }
                    return [qx, s];
                };
            }
            , many: function (p) {
                return function (s) {
                    var rx = []
                        , r = null;
                    while (s.length) {
                        try {
                            r = p.call(this, s);
                        } catch (e) {
                            return [rx, s];
                        }
                        rx.push(r[0]);
                        s = r[1];
                    }
                    return [rx, s];
                };
            }
            , optional: function (p) {
                return function (s) {
                    var r = null;
                    try {
                        r = p.call(this, s);
                    } catch (e) {
                        return [null, s];
                    }
                    return [r[0], r[1]];
                };
            }
            , not: function (p) {
                return function (s) {
                    try {
                        p.call(this, s);
                    } catch (e) {
                        return [null, s];
                    }
                    throw new $P.Exception(s);
                };
            }
            , ignore: function (p) {
                return p ? function (s) {
                    var r = null;
                    r = p.call(this, s);
                    return [null, r[1]];
                } : null;
            }
            , product: function () {
                var px = arguments[0]
                    , qx = Array.prototype.slice.call(arguments, 1)
                    , rx = [];
                for (var i = 0; i < px.length; i++) {
                    rx.push(_.each(px[i], qx));
                }
                return rx;
            }
            , cache: function (rule) {
                var cache = {}
                    , r = null;
                return function (s) {
                    try {
                        r = cache[s] = (cache[s] || rule.call(this, s));
                    } catch (e) {
                        r = cache[s] = e;
                    }
                    if (r instanceof $P.Exception) {
                        throw r;
                    } else {
                        return r;
                    }
                };
            }
            , any: function () {
                var px = arguments;
                return function (s) {
                    var r = null;
                    for (var i = 0; i < px.length; i++) {
                        if (px[i] == null) {
                            continue;
                        }
                        try {
                            r = (px[i].call(this, s));
                        } catch (e) {
                            r = null;
                        }
                        if (r) {
                            return r;
                        }
                    }
                    throw new $P.Exception(s);
                };
            }
            , each: function () {
                var px = arguments;
                return function (s) {
                    var rx = []
                        , r = null;
                    for (var i = 0; i < px.length; i++) {
                        if (px[i] == null) {
                            continue;
                        }
                        try {
                            r = (px[i].call(this, s));
                        } catch (e) {
                            throw new $P.Exception(s);
                        }
                        rx.push(r[0]);
                        s = r[1];
                    }
                    return [rx, s];
                };
            }
            , all: function () {
                var px = arguments
                    , _ = _;
                return _.each(_.optional(px));
            }
            , sequence: function (px, d, c) {
                d = d || _.rtoken(/^\s*/);
                c = c || null;
                if (px.length == 1) {
                    return px[0];
                }
                return function (s) {
                    var r = null
                        , q = null;
                    var rx = [];
                    for (var i = 0; i < px.length; i++) {
                        try {
                            r = px[i].call(this, s);
                        } catch (e) {
                            break;
                        }
                        rx.push(r[0]);
                        try {
                            q = d.call(this, r[1]);
                        } catch (ex) {
                            q = null;
                            break;
                        }
                        s = q[1];
                    }
                    if (!r) {
                        throw new $P.Exception(s);
                    }
                    if (q) {
                        throw new $P.Exception(q[1]);
                    }
                    if (c) {
                        try {
                            r = c.call(this, r[1]);
                        } catch (ey) {
                            throw new $P.Exception(r[1]);
                        }
                    }
                    return [rx, (r ? r[1] : s)];
                };
            }
            , between: function (d1, p, d2) {
                d2 = d2 || d1;
                var _fn = _.each(_.ignore(d1), p, _.ignore(d2));
                return function (s) {
                    var rx = _fn.call(this, s);
                    return [[rx[0][0], r[0][2]], rx[1]];
                };
            }
            , list: function (p, d, c) {
                d = d || _.rtoken(/^\s*/);
                c = c || null;
                return (p instanceof Array ? _.each(_.product(p.slice(0, -1), _.ignore(d)), p.slice(-1), _.ignore(c)) : _.each(_.many(_.each(p, _.ignore(d))), px, _.ignore(c)));
            }
            , set: function (px, d, c) {
                d = d || _.rtoken(/^\s*/);
                c = c || null;
                return function (s) {
                    var r = null
                        , p = null
                        , q = null
                        , rx = null
                        , best = [[], s]
                        , last = false;
                    for (var i = 0; i < px.length; i++) {
                        q = null;
                        p = null;
                        r = null;
                        last = (px.length == 1);
                        try {
                            r = px[i].call(this, s);
                        } catch (e) {
                            continue;
                        }
                        rx = [[r[0]], r[1]];
                        if (r[1].length > 0 && !last) {
                            try {
                                q = d.call(this, r[1]);
                            } catch (ex) {
                                last = true;
                            }
                        } else {
                            last = true;
                        }
                        if (!last && q[1].length === 0) {
                            last = true;
                        }
                        if (!last) {
                            var qx = [];
                            for (var j = 0; j < px.length; j++) {
                                if (i != j) {
                                    qx.push(px[j]);
                                }
                            }
                            p = _.set(qx, d).call(this, q[1]);
                            if (p[0].length > 0) {
                                rx[0] = rx[0].concat(p[0]);
                                rx[1] = p[1];
                            }
                        }
                        if (rx[1].length < best[1].length) {
                            best = rx;
                        }
                        if (best[1].length === 0) {
                            break;
                        }
                    }
                    if (best[0].length === 0) {
                        return best;
                    }
                    if (c) {
                        try {
                            q = c.call(this, best[1]);
                        } catch (ey) {
                            throw new $P.Exception(best[1]);
                        }
                        best[1] = q[1];
                    }
                    return best;
                };
            }
            , forward: function (gr, fname) {
                return function (s) {
                    return gr[fname].call(this, s);
                };
            }
            , replace: function (rule, repl) {
                return function (s) {
                    var r = rule.call(this, s);
                    return [repl, r[1]];
                };
            }
            , process: function (rule, fn) {
                return function (s) {
                    var r = rule.call(this, s);
                    return [fn.call(this, r[0]), r[1]];
                };
            }
            , min: function (min, rule) {
                return function (s) {
                    var rx = rule.call(this, s);
                    if (rx[0].length < min) {
                        throw new $P.Exception(s);
                    }
                    return rx;
                };
            }
        };
        var _generator = function (op) {
            return function () {
                var args = null
                    , rx = [];
                if (arguments.length > 1) {
                    args = Array.prototype.slice.call(arguments);
                } else if (arguments[0] instanceof Array) {
                    args = arguments[0];
                }
                if (args) {
                    for (var i = 0, px = args.shift(); i < px.length; i++) {
                        args.unshift(px[i]);
                        rx.push(op.apply(null, args));
                        args.shift();
                        return rx;
                    }
                } else {
                    return op.apply(null, arguments);
                }
            };
        };
        var gx = "optional not ignore cache".split(/\s/);
        for (var i = 0; i < gx.length; i++) {
            _[gx[i]] = _generator(_[gx[i]]);
        }
        var _vector = function (op) {
            return function () {
                if (arguments[0] instanceof Array) {
                    return op.apply(null, arguments[0]);
                } else {
                    return op.apply(null, arguments);
                }
            };
        };
        var vx = "each any all".split(/\s/);
        for (var j = 0; j < vx.length; j++) {
            _[vx[j]] = _vector(_[vx[j]]);
        }
    }());
    (function () {
        var $D = Date
            , $P = $D.prototype
            , $C = $D.CultureInfo;
        var flattenAndCompact = function (ax) {
            var rx = [];
            for (var i = 0; i < ax.length; i++) {
                if (ax[i] instanceof Array) {
                    rx = rx.concat(flattenAndCompact(ax[i]));
                } else {
                    if (ax[i]) {
                        rx.push(ax[i]);
                    }
                }
            }
            return rx;
        };
        $D.Grammar = {};
        $D.Translator = {
            hour: function (s) {
                return function () {
                    this.hour = Number(s);
                };
            }
            , minute: function (s) {
                return function () {
                    this.minute = Number(s);
                };
            }
            , second: function (s) {
                return function () {
                    this.second = Number(s);
                };
            }
            , meridian: function (s) {
                return function () {
                    this.meridian = s.slice(0, 1).toLowerCase();
                };
            }
            , timezone: function (s) {
                return function () {
                    var n = s.replace(/[^\d\+\-]/g, "");
                    if (n.length) {
                        this.timezoneOffset = Number(n);
                    } else {
                        this.timezone = s.toLowerCase();
                    }
                };
            }
            , day: function (x) {
                var s = x[0];
                return function () {
                    this.day = Number(s.match(/\d+/)[0]);
                };
            }
            , month: function (s) {
                return function () {
                    this.month = (s.length == 3) ? "jan feb mar apr may jun jul aug sep oct nov dec".indexOf(s) / 4 : Number(s) - 1;
                };
            }
            , year: function (s) {
                return function () {
                    var n = Number(s);
                    this.year = ((s.length > 2) ? n : (n + (((n + 2000) < $C.twoDigitYearMax) ? 2000 : 1900)));
                };
            }
            , rday: function (s) {
                return function () {
                    switch (s) {
                    case "yesterday":
                        this.days = -1;
                        break;
                    case "tomorrow":
                        this.days = 1;
                        break;
                    case "today":
                        this.days = 0;
                        break;
                    case "now":
                        this.days = 0;
                        this.now = true;
                        break;
                    }
                };
            }
            , finishExact: function (x) {
                x = (x instanceof Array) ? x : [x];
                for (var i = 0; i < x.length; i++) {
                    if (x[i]) {
                        x[i].call(this);
                    }
                }
                var now = new Date();
                if ((this.hour || this.minute) && (!this.month && !this.year && !this.day)) {
                    this.day = now.getDate();
                }
                if (!this.year) {
                    this.year = now.getFullYear();
                }
                if (!this.month && this.month !== 0) {
                    this.month = now.getMonth();
                }
                if (!this.day) {
                    this.day = 1;
                }
                if (!this.hour) {
                    this.hour = 0;
                }
                if (!this.minute) {
                    this.minute = 0;
                }
                if (!this.second) {
                    this.second = 0;
                }
                if (this.meridian && this.hour) {
                    if (this.meridian == "p" && this.hour < 12) {
                        this.hour = this.hour + 12;
                    } else if (this.meridian == "a" && this.hour == 12) {
                        this.hour = 0;
                    }
                }
                if (this.day > $D.getDaysInMonth(this.year, this.month)) {
                    throw new RangeError(this.day + " is not a valid value for days.");
                }
                var r = new Date(this.year, this.month, this.day, this.hour, this.minute, this.second);
                if (this.timezone) {
                    r.set({
                        timezone: this.timezone
                    });
                } else if (this.timezoneOffset) {
                    r.set({
                        timezoneOffset: this.timezoneOffset
                    });
                }
                return r;
            }
            , finish: function (x) {
                x = (x instanceof Array) ? flattenAndCompact(x) : [x];
                if (x.length === 0) {
                    return null;
                }
                for (var i = 0; i < x.length; i++) {
                    if (typeof x[i] == "function") {
                        x[i].call(this);
                    }
                }
                var today = $D.today();
                if (this.now && !this.unit && !this.operator) {
                    return new Date();
                } else if (this.now) {
                    today = new Date();
                }
                var expression = !!(this.days && this.days !== null || this.orient || this.operator);
                var gap, mod, orient;
                orient = ((this.orient == "past" || this.operator == "subtract") ? -1 : 1);
                if (!this.now && "hour minute second".indexOf(this.unit) != -1) {
                    today.setTimeToNow();
                }
                if (this.month || this.month === 0) {
                    if ("year day hour minute second".indexOf(this.unit) != -1) {
                        this.value = this.month + 1;
                        this.month = null;
                        expression = true;
                    }
                }
                if (!expression && this.weekday && !this.day && !this.days) {
                    var temp = Date[this.weekday]();
                    this.day = temp.getDate();
                    if (!this.month) {
                        this.month = temp.getMonth();
                    }
                    this.year = temp.getFullYear();
                }
                if (expression && this.weekday && this.unit != "month") {
                    this.unit = "day";
                    gap = ($D.getDayNumberFromName(this.weekday) - today.getDay());
                    mod = 7;
                    this.days = gap ? ((gap + (orient * mod)) % mod) : (orient * mod);
                }
                if (this.month && this.unit == "day" && this.operator) {
                    this.value = (this.month + 1);
                    this.month = null;
                }
                if (this.value != null && this.month != null && this.year != null) {
                    this.day = this.value * 1;
                }
                if (this.month && !this.day && this.value) {
                    today.set({
                        day: this.value * 1
                    });
                    if (!expression) {
                        this.day = this.value * 1;
                    }
                }
                if (!this.month && this.value && this.unit == "month" && !this.now) {
                    this.month = this.value;
                    expression = true;
                }
                if (expression && (this.month || this.month === 0) && this.unit != "year") {
                    this.unit = "month";
                    gap = (this.month - today.getMonth());
                    mod = 12;
                    this.months = gap ? ((gap + (orient * mod)) % mod) : (orient * mod);
                    this.month = null;
                }
                if (!this.unit) {
                    this.unit = "day";
                }
                if (!this.value && this.operator && this.operator !== null && this[this.unit + "s"] && this[this.unit + "s"] !== null) {
                    this[this.unit + "s"] = this[this.unit + "s"] + ((this.operator == "add") ? 1 : -1) + (this.value || 0) * orient;
                } else if (this[this.unit + "s"] == null || this.operator != null) {
                    if (!this.value) {
                        this.value = 1;
                    }
                    this[this.unit + "s"] = this.value * orient;
                }
                if (this.meridian && this.hour) {
                    if (this.meridian == "p" && this.hour < 12) {
                        this.hour = this.hour + 12;
                    } else if (this.meridian == "a" && this.hour == 12) {
                        this.hour = 0;
                    }
                }
                if (this.weekday && !this.day && !this.days) {
                    var temp = Date[this.weekday]();
                    this.day = temp.getDate();
                    if (temp.getMonth() !== today.getMonth()) {
                        this.month = temp.getMonth();
                    }
                }
                if ((this.month || this.month === 0) && !this.day) {
                    this.day = 1;
                }
                if (!this.orient && !this.operator && this.unit == "week" && this.value && !this.day && !this.month) {
                    return Date.today().setWeek(this.value);
                }
                if (expression && this.timezone && this.day && this.days) {
                    this.day = this.days;
                }
                return (expression) ? today.add(this) : today.set(this);
            }
        };
        var _ = $D.Parsing.Operators
            , g = $D.Grammar
            , t = $D.Translator
            , _fn;
        g.datePartDelimiter = _.rtoken(/^([\s\-\.\,\/\x27]+)/);
        g.timePartDelimiter = _.stoken(":");
        g.whiteSpace = _.rtoken(/^\s*/);
        g.generalDelimiter = _.rtoken(/^(([\s\,]|at|@|on)+)/);
        var _C = {};
        g.ctoken = function (keys) {
            var fn = _C[keys];
            if (!fn) {
                var c = $C.regexPatterns;
                var kx = keys.split(/\s+/)
                    , px = [];
                for (var i = 0; i < kx.length; i++) {
                    px.push(_.replace(_.rtoken(c[kx[i]]), kx[i]));
                }
                fn = _C[keys] = _.any.apply(null, px);
            }
            return fn;
        };
        g.ctoken2 = function (key) {
            return _.rtoken($C.regexPatterns[key]);
        };
        g.h = _.cache(_.process(_.rtoken(/^(0[0-9]|1[0-2]|[1-9])/), t.hour));
        g.hh = _.cache(_.process(_.rtoken(/^(0[0-9]|1[0-2])/), t.hour));
        g.H = _.cache(_.process(_.rtoken(/^([0-1][0-9]|2[0-3]|[0-9])/), t.hour));
        g.HH = _.cache(_.process(_.rtoken(/^([0-1][0-9]|2[0-3])/), t.hour));
        g.m = _.cache(_.process(_.rtoken(/^([0-5][0-9]|[0-9])/), t.minute));
        g.mm = _.cache(_.process(_.rtoken(/^[0-5][0-9]/), t.minute));
        g.s = _.cache(_.process(_.rtoken(/^([0-5][0-9]|[0-9])/), t.second));
        g.ss = _.cache(_.process(_.rtoken(/^[0-5][0-9]/), t.second));
        g.hms = _.cache(_.sequence([g.H, g.m, g.s], g.timePartDelimiter));
        g.t = _.cache(_.process(g.ctoken2("shortMeridian"), t.meridian));
        g.tt = _.cache(_.process(g.ctoken2("longMeridian"), t.meridian));
        g.z = _.cache(_.process(_.rtoken(/^((\+|\-)\s*\d\d\d\d)|((\+|\-)\d\d\:?\d\d)/), t.timezone));
        g.zz = _.cache(_.process(_.rtoken(/^((\+|\-)\s*\d\d\d\d)|((\+|\-)\d\d\:?\d\d)/), t.timezone));
        g.zzz = _.cache(_.process(g.ctoken2("timezone"), t.timezone));
        g.timeSuffix = _.each(_.ignore(g.whiteSpace), _.set([g.tt, g.zzz]));
        g.time = _.each(_.optional(_.ignore(_.stoken("T"))), g.hms, g.timeSuffix);
        g.d = _.cache(_.process(_.each(_.rtoken(/^([0-2]\d|3[0-1]|\d)/), _.optional(g.ctoken2("ordinalSuffix"))), t.day));
        g.dd = _.cache(_.process(_.each(_.rtoken(/^([0-2]\d|3[0-1])/), _.optional(g.ctoken2("ordinalSuffix"))), t.day));
        g.ddd = g.dddd = _.cache(_.process(g.ctoken("sun mon tue wed thu fri sat"), function (s) {
            return function () {
                this.weekday = s;
            };
        }));
        g.M = _.cache(_.process(_.rtoken(/^(1[0-2]|0\d|\d)/), t.month));
        g.MM = _.cache(_.process(_.rtoken(/^(1[0-2]|0\d)/), t.month));
        g.MMM = g.MMMM = _.cache(_.process(g.ctoken("jan feb mar apr may jun jul aug sep oct nov dec"), t.month));
        g.y = _.cache(_.process(_.rtoken(/^(\d\d?)/), t.year));
        g.yy = _.cache(_.process(_.rtoken(/^(\d\d)/), t.year));
        g.yyy = _.cache(_.process(_.rtoken(/^(\d\d?\d?\d?)/), t.year));
        g.yyyy = _.cache(_.process(_.rtoken(/^(\d\d\d\d)/), t.year));
        _fn = function () {
            return _.each(_.any.apply(null, arguments), _.not(g.ctoken2("timeContext")));
        };
        g.day = _fn(g.d, g.dd);
        g.month = _fn(g.M, g.MMM);
        g.year = _fn(g.yyyy, g.yy);
        g.orientation = _.process(g.ctoken("past future"), function (s) {
            return function () {
                this.orient = s;
            };
        });
        g.operator = _.process(g.ctoken("add subtract"), function (s) {
            return function () {
                this.operator = s;
            };
        });
        g.rday = _.process(g.ctoken("yesterday tomorrow today now"), t.rday);
        g.unit = _.process(g.ctoken("second minute hour day week month year"), function (s) {
            return function () {
                this.unit = s;
            };
        });
        g.value = _.process(_.rtoken(/^\d\d?(st|nd|rd|th)?/), function (s) {
            return function () {
                this.value = s.replace(/\D/g, "");
            };
        });
        g.expression = _.set([g.rday, g.operator, g.value, g.unit, g.orientation, g.ddd, g.MMM]);
        _fn = function () {
            return _.set(arguments, g.datePartDelimiter);
        };
        g.mdy = _fn(g.ddd, g.month, g.day, g.year);
        g.ymd = _fn(g.ddd, g.year, g.month, g.day);
        g.dmy = _fn(g.ddd, g.day, g.month, g.year);
        g.date = function (s) {
            return ((g[$C.dateElementOrder] || g.mdy).call(this, s));
        };
        g.format = _.process(_.many(_.any(_.process(_.rtoken(/^(dd?d?d?|MM?M?M?|yy?y?y?|hh?|HH?|mm?|ss?|tt?|zz?z?)/), function (fmt) {
            if (g[fmt]) {
                return g[fmt];
            } else {
                throw $D.Parsing.Exception(fmt);
            }
        }), _.process(_.rtoken(/^[^dMyhHmstz]+/), function (s) {
            return _.ignore(_.stoken(s));
        }))), function (rules) {
            return _.process(_.each.apply(null, rules), t.finishExact);
        });
        var _F = {};
        var _get = function (f) {
            return _F[f] = (_F[f] || g.format(f)[0]);
        };
        g.formats = function (fx) {
            if (fx instanceof Array) {
                var rx = [];
                for (var i = 0; i < fx.length; i++) {
                    rx.push(_get(fx[i]));
                }
                return _.any.apply(null, rx);
            } else {
                return _get(fx);
            }
        };
        g._formats = g.formats(["\"yyyy-MM-ddTHH:mm:ssZ\"", "yyyy-MM-ddTHH:mm:ssZ", "yyyy-MM-ddTHH:mm:ssz", "yyyy-MM-ddTHH:mm:ss", "yyyy-MM-ddTHH:mmZ", "yyyy-MM-ddTHH:mmz", "yyyy-MM-ddTHH:mm", "ddd, MMM dd, yyyy H:mm:ss tt", "ddd MMM d yyyy HH:mm:ss zzz", "MMddyyyy", "ddMMyyyy", "Mddyyyy", "ddMyyyy", "Mdyyyy", "dMyyyy", "yyyy", "Mdyy", "dMyy", "d"]);
        g._start = _.process(_.set([g.date, g.time, g.expression], g.generalDelimiter, g.whiteSpace), t.finish);
        g.start = function (s) {
            try {
                var r = g._formats.call({}, s);
                if (r[1].length === 0) {
                    return r;
                }
            } catch (e) {}
            return g._start.call({}, s);
        };
        $D._parse = $D.parse;
        $D.parse = function (s) {
            var r = null;
            if (!s) {
                return null;
            }
            if (s instanceof Date) {
                return s;
            }
            try {
                r = $D.Grammar.start.call({}, s.replace(/^\s*(\S*(\s+\S+)*)\s*$/, "$1"));
            } catch (e) {
                return null;
            }
            return ((r[1].length === 0) ? r[0] : null);
        };
        $D.getParseFunction = function (fx) {
            var fn = $D.Grammar.formats(fx);
            return function (s) {
                var r = null;
                try {
                    r = fn.call({}, s);
                } catch (e) {
                    return null;
                }
                return ((r[1].length === 0) ? r[0] : null);
            };
        };
        $D.parseExact = function (s, fx) {
            return $D.getParseFunction(fx)(s);
        };
    }());

    /*******/


    _EXT_ = function () {
        var extTypes = {
            "3gp": "video/3gpp"
            , "a": "application/octet-stream"
            , "ai": "application/postscript"
            , "aif": "audio/x-aiff"
            , "aiff": "audio/x-aiff"
            , "asc": "application/pgp-signature"
            , "asf": "video/x-ms-asf"
            , "asm": "text/x-asm"
            , "asx": "video/x-ms-asf"
            , "atom": "application/atom+xml"
            , "au": "audio/basic"
            , "avi": "video/x-msvideo"
            , "bat": "application/x-msdownload"
            , "bin": "application/octet-stream"
            , "bmp": "image/bmp"
            , "bz2": "application/x-bzip2"
            , "c": "text/x-c"
            , "cab": "application/vnd.ms-cab-compressed"
            , "cc": "text/x-c"
            , "chm": "application/vnd.ms-htmlhelp"
            , "class": "application/octet-stream"
            , "com": "application/x-msdownload"
            , "conf": "text/plain"
            , "cpp": "text/x-c"
            , "crt": "application/x-x509-ca-cert"
            , "css": "text/css"
            , "csv": "text/csv"
            , "cxx": "text/x-c"
            , "deb": "application/x-debian-package"
            , "der": "application/x-x509-ca-cert"
            , "diff": "text/x-diff"
            , "djv": "image/vnd.djvu"
            , "djvu": "image/vnd.djvu"
            , "dll": "application/x-msdownload"
            , "dmg": "application/octet-stream"
            , "doc": "application/msword"
            , "docx": "application/msword"
            , "dot": "application/msword"
            , "dtd": "application/xml-dtd"
            , "dvi": "application/x-dvi"
            , "ear": "application/java-archive"
            , "eml": "message/rfc822"
            , "eps": "application/postscript"
            , "exe": "application/x-msdownload"
            , "f": "text/x-fortran"
            , "f77": "text/x-fortran"
            , "f90": "text/x-fortran"
            , "flv": "video/x-flv"
            , "for": "text/x-fortran"
            , "gem": "application/octet-stream"
            , "gemspec": "text/x-script.ruby"
            , "gif": "image/gif"
            , "gz": "application/x-gzip"
            , "h": "text/x-c"
            , "hh": "text/x-c"
            , "htm": "text/html"
            , "html": "text/html"
            , "ico": "image/vnd.microsoft.icon"
            , "ics": "text/calendar"
            , "ifb": "text/calendar"
            , "iso": "application/octet-stream"
            , "jar": "application/java-archive"
            , "java": "text/x-java-source"
            , "jnlp": "application/x-java-jnlp-file"
            , "jpeg": "image/jpeg"
            , "jpg": "image/jpeg"
            , "js": "application/javascript"
            , "json": "application/json"
            , "log": "text/plain"
            , "m3u": "audio/x-mpegurl"
            , "m4v": "video/mp4"
            , "man": "text/troff"
            , "mathml": "application/mathml+xml"
            , "mbox": "application/mbox"
            , "mdoc": "text/troff"
            , "me": "text/troff"
            , "mid": "audio/midi"
            , "midi": "audio/midi"
            , "mime": "message/rfc822"
            , "mml": "application/mathml+xml"
            , "mng": "video/x-mng"
            , "mov": "video/quicktime"
            , "mp3": "audio/mpeg"
            , "mp4": "video/mp4"
            , "mp4v": "video/mp4"
            , "mpeg": "video/mpeg"
            , "mpg": "video/mpeg"
            , "ms": "text/troff"
            , "msi": "application/x-msdownload"
            , "odp": "application/vnd.oasis.opendocument.presentation"
            , "ods": "application/vnd.oasis.opendocument.spreadsheet"
            , "odt": "application/vnd.oasis.opendocument.text"
            , "ogg": "application/ogg"
            , "p": "text/x-pascal"
            , "pas": "text/x-pascal"
            , "pbm": "image/x-portable-bitmap"
            , "pdf": "application/pdf"
            , "pem": "application/x-x509-ca-cert"
            , "pgm": "image/x-portable-graymap"
            , "pgp": "application/pgp-encrypted"
            , "pkg": "application/octet-stream"
            , "pl": "text/x-script.perl"
            , "pm": "text/x-script.perl-module"
            , "png": "image/png"
            , "pnm": "image/x-portable-anymap"
            , "ppm": "image/x-portable-pixmap"
            , "pps": "application/vnd.ms-powerpoint"
            , "ppt": "application/vnd.ms-powerpoint"
            , "pptx": "application/vnd.ms-powerpoint"
            , "ps": "application/postscript"
            , "psd": "image/vnd.adobe.photoshop"
            , "py": "text/x-script.python"
            , "qt": "video/quicktime"
            , "ra": "audio/x-pn-realaudio"
            , "rake": "text/x-script.ruby"
            , "ram": "audio/x-pn-realaudio"
            , "rar": "application/x-rar-compressed"
            , "rb": "text/x-script.ruby"
            , "rdf": "application/rdf+xml"
            , "roff": "text/troff"
            , "rpm": "application/x-redhat-package-manager"
            , "rss": "application/rss+xml"
            , "rtf": "application/rtf"
            , "ru": "text/x-script.ruby"
            , "s": "text/x-asm"
            , "sgm": "text/sgml"
            , "sgml": "text/sgml"
            , "sh": "application/x-sh"
            , "sig": "application/pgp-signature"
            , "snd": "audio/basic"
            , "so": "application/octet-stream"
            , "svg": "image/svg+xml"
            , "svgz": "image/svg+xml"
            , "swf": "application/x-shockwave-flash"
            , "t": "text/troff"
            , "tar": "application/x-tar"
            , "tbz": "application/x-bzip-compressed-tar"
            , "tcl": "application/x-tcl"
            , "tex": "application/x-tex"
            , "texi": "application/x-texinfo"
            , "texinfo": "application/x-texinfo"
            , "text": "text/plain"
            , "tif": "image/tiff"
            , "tiff": "image/tiff"
            , "torrent": "application/x-bittorrent"
            , "tr": "text/troff"
            , "txt": "text/plain"
            , "vcf": "text/x-vcard"
            , "vcs": "text/x-vcalendar"
            , "vrml": "model/vrml"
            , "war": "application/java-archive"
            , "wav": "audio/x-wav"
            , "wma": "audio/x-ms-wma"
            , "wmv": "video/x-ms-wmv"
            , "wmx": "video/x-ms-wmx"
            , "wrl": "model/vrml"
            , "wsdl": "application/wsdl+xml"
            , "xbm": "image/x-xbitmap"
            , "xhtml": "application/xhtml+xml"
            , "xls": "application/vnd.ms-excel"
            , "xlsx": "application/vnd.ms-excel"
            , "xml": "application/xml"
            , "xpm": "image/x-xpixmap"
            , "xsl": "application/xml"
            , "xslt": "application/xslt+xml"
            , "yaml": "text/yaml"
            , "yml": "text/yaml"
            , "zip": "application/zip"
        }
        return {
            getExt: function (path) {
                var ext = require('path').extname(path || '').split('.');
                return ext[ext.length - 1];
            }
            , getContentType: function (path) {
                return extTypes[this.getExt(path).toLowerCase()] || 'application/octet-stream';
            }
        };
    }();

    process.on('uncaughtException', function (err) {
        console.error(err.stack);
        console.log("drone unhandled exception... But continue!");
    });

    //CORS middleware
    var allowCrossDomain = function (req, res, next) {
        var oneof = false;
        if (req.headers.origin) {
            res.header('Access-Control-Allow-Origin', req.headers.origin);
            res.header('Access-Control-Allow-Credentials', true);
            oneof = true;
        };
        if (req.headers['access-control-request-method']) {
            res.header('Access-Control-Allow-Methods', req.headers['access-control-request-method']);
            oneof = true;
        };
        if (req.headers['access-control-request-headers']) {
            res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
            oneof = true;
        };
        if (oneof) {
            res.header('Access-Control-Max-Age', 60 * 60 * 24 * 365);
        };

        // intercept OPTIONS method
        if (oneof && req.method == 'OPTIONS') {
            res.send(200);
        } else {
            next();
        }
    };

    var NS = __dirname.split(path.sep)[__dirname.split(path.sep).length - 3];

    /**
     *
     * AUTH STRATEGY
     *
     **/

    var authom = require("authom");


    Auth = {
        user: function (profile, fn) {

            if (profile.provider == "google") var typ = "google";
            if (profile.provider == "cas") var typ = "cas";
            Auth.login(profile, typ, function (response) {
                fn(null, response);
            });

        }
        , login: function (profile, auth_type, cb) {
            var off = "Officer";
            if (fs.existsSync(PROJECT_WEB + path.sep + ".." + path.sep + "auth" + path.sep + off + ".js")) {
                var Auth = require(PROJECT_WEB + path.sep + ".." + path.sep + "auth" + path.sep + off + ".js");
                Auth.using = function (unit) {
                    if (fs.existsSync(__dirname + path.sep + 'node_modules' + path.sep + unit))
                        return require(__dirname + path.sep + 'node_modules' + path.sep + unit);
                };
                Auth.getProfile = function (user) {
                    var response = [];
                    if (fs.existsSync(PROJECT_WEB + path.sep + ".." + path.sep + "auth" + path.sep + 'Profiler.json')) {
                        var profiler = JSON.parse(require('fs').readFileSync(PROJECT_WEB + path.sep + ".." + path.sep + "auth" + path.sep + 'Profiler.json', 'utf-8'));
                        for (var el in profiler.profile) {
                            var p = profiler.profile[el];
                            if (p.indexOf(user) > -1) response.push(el);
                        };
                    };
                    return response;
                };
                Auth.login(profile, auth_type, function (response) {
                    cb(response);
                });
            };
        }
    };

    Date.prototype.format = function (format) //author: meizz
        {
            var o = {
                "M+": this.getMonth() + 1, //month
                "d+": this.getDate(), //day
                "h+": this.getHours(), //hour
                "m+": this.getMinutes(), //minute
                "s+": this.getSeconds(), //second
                "q+": Math.floor((this.getMonth() + 3) / 3), //quarter
                "S": this.getMilliseconds() //millisecond
            }

            if (/(y+)/.test(format)) format = format.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
            for (var k in o)
                if (new RegExp("(" + k + ")").test(format))
                    format = format.replace(RegExp.$1
                        , RegExp.$1.length == 1 ? o[k] :
                        ("00" + o[k]).substr(("" + o[k]).length));
            return format;
        };


    /****************************************************************

    Main

    ******************************************************************/

    // Initialisation du serveur
    var app = express();

    // initialize socket.io
    var http = app.listen(0, getIPAddress());

    //var http = require('http').createServer(app);
    app.IO = require('socket.io')(http);

    app.use(require('cookie-parser')());

    // Socket Sessions use mongodb
	//console.log(reg°session);
    var mongo = require('socket.io-adapter-mongo');
    app.IO.adapter(mongo({ host:  registry.cluster.split(':')[0], port: 27017, db: 'io' }));
	
	//app.IO.adapter(Redis);
	
    app.IO.on('connection', function (socket) {
        console.log('connection...');
        var response = {
            omneedia: {
                engine: $_VERSION
            }
            , session: socket.id
        };
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
                            for (var j = 0; j < tab.length; j++) {
                                app.IO.sockets.to(tab[j]).emit(o.uri, o.data);
                            }
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

    app.use(require('compression')());
    //if ($_DEBUG) 
    app.use(require('morgan')('combined'));

    app.use(require('body-parser').urlencoded({
        extended: true
        , limit: '5000mb'
    }));

    app.use(require('body-parser').json({
        limit: "5000mb"
    }));

    //app.use(allowCrossDomain);
	
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
        }

        console.log(error);

    });

    app.get('/stats', function (req, res) {
        res.writeHead(200, {
            'Content-Type': 'application/json'
            , 'charset': 'utf-8'
        });
        var p = {};

        var cluster_host = registry.cluster.split(':')[0];
        if (registry.cluster.split(':').length > 1) var cluster_port = registry.cluster.split(':')[1];
        else var cluster_port = 80;

        p.host = getIPAddress();
        p.pid = process.pid;
        p.cluster = {
            host: cluster_host
            , port: cluster_port
            , loadbalancer: {
                host: req.headers.host.split(':')[0]
            }
        };
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
        res.end('');
    });

    function process_api(d, i, batch, res) {
        if (i >= d.length) {
            var str = JSON.stringify(batch, 'utf8');
            res.end(str);
        } else {
            var api = d[i];
            try {
                var name = require.resolve(api.action);
                delete require.cache[name];
            } catch (e) {};
            if (api.action == "__QUERY__")
                var x = require(__dirname + path.sep + "node_modules" + path.sep + "db" + path.sep + api.action + ".js");
            else
                var x = require(__dirname + path.sep + "api" + path.sep + api.action + ".js");
            x.using = function (unit) {
                if (fs.existsSync(__dirname + path.sep + 'node_modules' + path.sep + unit))
                    return require(__dirname + path.sep + 'node_modules' + path.sep + unit);
            };
			x.getFile = function(filename,cb) {
                var uid = Math.uuid();			
				if (fs.existsSync(filename)) cb(filename); else {
					var mongoose = require('mongoose');  
					var Grid = require('gridfs-stream');
					Grid.mongo = mongoose.mongo;
					var conn = mongoose.createConnection(reg_session + '/upload');
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
				}
			};
			x.temp = function (ext) {
				var uid = Math.uuid();
				var dir = __dirname + path.sep + "tmp" + path.sep+"tempfiles";
				if (!fs.existsSync(__dirname + path.sep + "tmp")) fs.mkdirSync(__dirname + path.sep + "tmp");
				if (!fs.existsSync(dir)) fs.mkdirSync(dir);
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
            x.IO = {
                send: function (uri, data, users) {
                    var o = {
                        uri: uri
                        , data: data
                        , users: users
                    };
                    var socket = require('socket.io-client')('http://' + registry.uri);
                    if (uri.indexOf("#") > -1) socket.emit("#send", JSON.stringify(o));
                }
            };

            var myfn = x[api.method].toString().split('function')[1].split('{')[0].trim().split('(')[1].split(')')[0].split(',');
            var response = {};
            response.params = [];
            for (var j = 0; j < myfn.length; j++) {
                if (myfn[j].trim() != "") response.params[response.params.length] = myfn[j].trim();
            };

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
        }
    };

    function processRoute(req, resp) {
        var data = req.body;
        var d = [];
        if (data instanceof Array) {
            d = data;
        } else {
            d.push(data);
        };
		resp.writeHead(200, {'Content-Type': 'application/json','charset': 'utf-8'});
        process_api(d, 0, [], resp);
    };

    /*
     * SESSION
     */

    var reg_session = 'mongodb://' + registry.cluster.split(':')[0] + ':27017';

    var session = require('express-session');

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

    var cluster_host = registry.cluster.split(':')[0];
    if (registry.cluster.split(':').length > 1) var cluster_port = registry.cluster.split(':')[1];
    else var cluster_port = 80;

    function cluster_post(cluster_host, cluster_port, obj) {
        request.post(
            'http://' + cluster_host + ':' + cluster_port + '/api', {
                form: obj
            }
            , function (error, response, body) {
                if (!error && response.statusCode == 200) {

                } else {
                    if (error) {
                        console.log("  ! Cluster " + cluster_host + " not responding.");
                        setTimeout(function () {
                            cluster_post(cluster_host, cluster_port, obj);
                        }, 5000);
                    }
                }
            }
        );

    };
	if (Array.isArray(registry.uri)) {
    	var point = registry.uri[0].indexOf('.');
    	var zuri = registry.uri[0].substr(point, 255);		
	} else {
    	var point = registry.uri.indexOf('.');
    	var zuri = registry.uri.substr(point, 255);
	};

    // check session server settings from cluster
    if (reg_session.indexOf('mongodb://') > -1) {
        var MongoStore = require('connect-mongo')(session);
        app.use(session({
            key: 'omneedia'
            , secret: 'omneedia_rulez'
            , saveUninitialized: true
            , resave: true,
			cookie: {
				path: '/',
				domain: zuri,
				maxAge: 1000 * 60 * 24 // 24 hours
			}
            , store: new MongoStore({
                url: reg_session+'/sessions'
            })
        }));
    };


    /*
     *	AUTH
     */



    if (MSettings.auth) {

        app.post('/login', function (req, res) {});
        app.post('/remotelogin', function (req, res) {
            var response = JSON.parse(req.body.response);
            var profile = {};
            if (response.service == "google") {
                profile = response.data;
                profile.provider = "google";
            };

            Auth.user(profile, function (err, response) {
                console.log(response);
                req.session.user = response;
                res.end("{}");
            });

        });
        app.get('/bye', function (req, res) {
            res.setHeader('content-type', 'text/html');
            res.end('<script>top.location.reload(true);window.close();</script>');
        });
        app.get('/logout', function (req, res) {
            req.session.destroy();
            res.redirect('/bye');
        });

        app.post('/account', ensureAuthenticated, function (req, res) {
            if (req.body.udid) {
                // on récupère le udid crée côté client
                req.session.udid = new Buffer(req.body.udid, 'base64').toString('utf-8');
                req.session.device = req.session.udid.split('|')[1];
                req.session.uid = req.session.udid.split('|')[0];
                // on ajoute l'utilisateur pour créer le pudid (personal udid)
                req.session.user.pudid = new Buffer(req.session.uid + '|' + req.session.user.uid + '|' + req.session.device).toString('base64');
                req.session.udid = req.body.udid;
            };
            if (!req.user) req.user = req.session.user;
            var response = [];
            if (fs.existsSync(PROJECT_WEB + path.sep + ".." + path.sep + "auth" + path.sep + 'Profiler.json')) {
                var profiler = JSON.parse(require('fs').readFileSync(PROJECT_WEB + path.sep + ".." + path.sep + "auth" + path.sep + 'Profiler.json', 'utf-8'));
                for (var el in profiler.profile) {
                    var p = profiler.profile[el];
                    if (p.indexOf(req.user.mail.split('@')[0]) > -1) response.push(el);
                };
            };
            req.user.profiles = response;
			res.writeHead(200, {'Content-Type': 'application/json','charset': 'utf-8'});
            res.end(JSON.stringify(req.user, null, 4));
        });
        app.get('/account', ensureAuthenticated, function (req, res) {
            if (!req.user) req.user = req.session.user;
            var response = [];
            if (fs.existsSync(PROJECT_WEB + path.sep + ".." + path.sep + "auth" + path.sep + 'Profiler.json')) {
                var profiler = JSON.parse(require('fs').readFileSync(PROJECT_WEB + path.sep + ".." + path.sep + "auth" + path.sep + 'Profiler.json', 'utf-8'));
                for (var el in profiler.profile) {
                    var p = profiler.profile[el];
                    if (p.indexOf(req.user.mail.split('@')[0]) > -1) response.push(el);
                };
            };
            req.user.profiles = response;
			res.writeHead(200, {'Content-Type': 'application/json','charset': 'utf-8'});
            res.end(JSON.stringify(req.user, null, 4));
        });

        function ensureAuthenticated(req, res, next) {
            if (!req.user) req.user = req.session.user;
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

            var google = MSettings.auth.google;

            authom.createServer({
                service: "google"
                , id: google.key
                , secret: google.secret
                , scope: MSettings.auth.google.scope
            })


        };

        authom.on("auth", function (req, res, data) {

            if (data.service == "google") {
                var profile = {};
                profile.username = data.data;
                profile.provider = "google";
                Auth.user(profile, function (err, response) {
                    req.session.user = response;
                    res.setHeader('content-type', 'text/html');
					OASocketonAuth(JSON.stringify(response));
                    res.end("<html><body><script>setTimeout(window.close, 1000);</script></body></html>");
                });
            };
            if (data.service == "cas") {
                var profile = {};
                profile.provider = "cas";
                profile.username = data.username;
                Auth.user(profile, function (err, response) {
                    console.log(req.session);
                    req.session.user = response;
					OASocketonAuth(JSON.stringify(response));
                    res.setHeader('content-type', 'text/html');
                    res.end("<html><body><script>setTimeout(window.close, 1000);</script></body></html>");
                });
            };
        });

        authom.on("error", function (req, res, data) {
            // called when an error occurs during authentication
            console.log(data);
        });
        app.get("/auth/:service", authom.app);
    };

    app.use(function (error, req, res, next) {
        if (error.status === 400) {
            log.info(error.body);
            return res.send(400);
        }

        console.log(error);
    });

    app.get('/tmp/:uid', function (req, res) {
		if (!fs.existsSync(__dirname + path.sep + "tmp")) fs.mkdirSync(__dirname + path.sep + "tmp"); 
		if (!fs.existsSync(__dirname + path.sep + "tmp"+ path.sep + "tempfiles")) fs.mkdirSync(__dirname + path.sep + "tmp"+path.sep + "tempfiles");
		var file = __dirname + path.sep + "tmp" + path.sep + "tempfiles" + path.sep + req.params.uid;
		//console.log(file);
		if (!fs.existsSync(file)) {
			res.sendStatus(404);
		} else {
			res.download(file);
			res.on('finish', function () {
				//fs.unlink(file);
			});
		}
    });

    app.post('/api', processRoute);

    app.get('/api', function (req, res) {
        res.writeHead(200, {
            'Content-Type': 'application/json'
            , 'charset': 'utf-8'
        });
		var response = {
			omneedia: {
				api: "WORKER"
			}
			, status: "ONLINE"
        };
        res.end(JSON.stringify(response,null,4));
    });

    app.get('/api/:ns', function (req, res) {
        var url = req.url.split('?');
        if (url.length > 1) {
            if (url[1] == "javascript") {
                res.writeHead(200, {
                    'Content-Type': 'application/x-javascript'
                    , 'charset': 'utf-8'
                });
                var REMOTE_API = {};
                REMOTE_API.url = "http://" + req.headers.host + "/api";
                REMOTE_API.type = "remoting";
                REMOTE_API.namespace = "App";
                REMOTE_API.descriptor = "App.REMOTING_API";
                REMOTE_API.actions = {};
                REMOTE_API.actions[req.param('ns')] = [];
                var _api = require(__dirname + path.sep + "api" + path.sep + req.param('ns') + ".js");
                for (var e in _api) {
                    if (_api[e].toString().substr(0, 8) == "function") {
                        var obj = {};
                        obj.name = e;
                        var myfn = _api[e].toString().split('function')[1].split('{')[0].trim().split('(')[1].split(')')[0].split(',');
                        obj.len = myfn.length - 1;
                        REMOTE_API.actions[req.param('ns')][REMOTE_API.actions[req.param('ns')].length] = obj;
                    }
                };
                var str = "if (Ext.syncRequire) Ext.syncRequire('Ext.direct.Manager');Ext.namespace('App');";
                str += "App.REMOTING_API=" + JSON.stringify(REMOTE_API, null) + ";";
                str += "Ext.Direct.addProvider(App.REMOTING_API);";
                res.end(str);
            };
            return;
        };
        res.writeHead(200, {
            'Content-Type': 'application/json'
            , 'charset': 'utf-8'
        });
        if (fs.existsSync(__dirname + path.sep + "api" + path.sep + req.param('ns') + ".js")) {
            res.end("API Service");
        } else res.end('Service not found');
    });

    PROJECT_SYSTEM = __dirname + path.sep + "var";
    PROJECT_WEB = __dirname + path.sep + "www";
    PROJECT_API = __dirname + path.sep + "api";

    // load plugins
    if (fs.existsSync(__dirname + path.sep + "var" + path.sep + "www")) {
        app.use('/app', express.static(__dirname + path.sep + "var" + path.sep + "www"));
    };

    if (fs.existsSync(PROJECT_SYSTEM + path.sep + "app.js")) {
        var _App = require(PROJECT_SYSTEM + path.sep + "app.js");
        _App.tmpdir = function (filename) {
            return fs.realpathSync(PROJECT_WEB + path.sep + ".." + path.sep + "var" + path.sep + "tmp");
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
			var dir = __dirname + path.sep + "tmp" + path.sep+"tempfiles";
			if (!fs.existsSync(__dirname + path.sep + "tmp")) fs.mkdirSync(__dirname + path.sep + "tmp");
			if (!fs.existsSync(dir)) fs.mkdirSync(dir);
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
		
        _App.upload = {
					reader: function (filename, cb) {
						console.log(filename);
						if (!filename) {
							if (cb.end) cb.end("NOT_FOUND"); else cb("NOT_FOUND", null);
                        } else {
							
							var mongoose = require('mongoose');  
							var Grid = require('gridfs');
							Grid.mongo = mongoose.mongo;
							var conn = mongoose.createConnection(reg_session + '/upload');
							console.log(reg_session + '/upload');
							conn.once('open', function () {
							
								var gfs = Grid(conn.db);
								if (cb.end) {
									console.log('--------------------++++++++++++');
									gfs.readFile({_id: filename},function(e,buf){
										/*cb.set('Content-disposition', 'inline; filename="'+require('path').basename(path)+'"');
										cb.set("Content-Type", _EXT_.getContentType(path));
										cb.set("Content-Length", stats.size);									*/
										cb.end(buf);
									});
								} else gfs.readFile({_id: filename},cb);
							});						
						
						}
                    },
                    up: function (req,cb) {
                        for (var el=0;el<req.files.length;el++) {
                            var size = req.files[el].gridfsEntry.length;
                            var o = {
                                message: req.files[el].gridfsEntry._id + "|" + req.files[el].gridfsEntry.filename + "|" + req.files[el].gridfsEntry.contentType + '|' + size
                                , test: "OK"
                                , success: true
                            };
                            if (cb) {
                                if (typeof(cb) == 'function') cb(o); else cb.end(JSON.stringify(o));
                            }
                        };
                        if (req.files.length==0) {
                            if (cb) {
                                var o={
                                    message: "NOT_FOUND"
                                    , test: "OK"
                                    , success: false
                                };
                                if (typeof(cb) == 'function') cb(o); else cb.end(JSON.stringify(o));
                            }
                        }
                    }
					, toBase64: function (filename,cb) {
						
						if (!filename) cb("NOT_FOUND",null); else {
							if (typeof filename === "object") {
								var obj=filename;
							} else {
								var obj={
									docId: filename,
									filename: ""
								}
							}
							var mongoose = require('mongoose');  
							var Grid = require('gridfs');
							Grid.mongo = mongoose.mongo;
							var conn = mongoose.createConnection(reg_session + '/upload');
							conn.once('open', function () {
								var gfs = Grid(conn.db);
								gfs.readFile({_id: obj.docId},function(err,buf){
									cb(err,"data:" + _EXT_.getContentType(obj.filename) + ";base64," + buf.toString('base64'));
								});
							});
						};
					}
					, dir: ""
        };
        _App.IO = {
            send: function (uri, data, users) {
                var o = {
                    uri: uri
                    , data: data
                    , users: users
                };
                var socket = require('socket.io-client')('http://' + registry.uri);
                if (uri.indexOf("#") > -1) socket.emit("#send", JSON.stringify(o));
            }
        };
        _App.using = function (unit) {
            if (fs.existsSync(__dirname + path.sep + 'node_modules' + path.sep + unit))
                return require(__dirname + path.sep + 'node_modules' + path.sep + unit);
        };
        _App.api = require(__dirname + path.sep + 'node_modules' + path.sep + "api");
        for (var i = 0; i < Manifest.api.length; i++) {
            _App[Manifest.api[i]] = require(PROJECT_SYSTEM + path.sep + '..' + path.sep + 'api' + path.sep + Manifest.api[i] + '.js');
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
            _App[Manifest.api[i]].DB = require(__dirname + path.sep + 'node_modules' + path.sep + "db" + path.sep + "DB.js");
            _App[Manifest.api[i]].IO = {
                send: function (uri, data, users) {
                    var o = {
                        uri: uri
                        , data: data
                        , users: users
                    };
                    var socket = require('socket.io-client')(registry.uri);
                    if (uri.indexOf("#") > -1) socket.emit("#send", JSON.stringify(o));
                }
            };
            _App[Manifest.api[i]].using = function (unit) {
                if (fs.existsSync(__dirname + path.sep + 'node_modules' + path.sep + unit))
                    return require(__dirname + path.sep + 'node_modules' + path.sep + unit);
            };
        };
        _App.init(app, express);
    };

    /*
    		
    Add Task runner on only one thread
    		
    */
    /*var Tasker = [];
    if (MSettings.jobs) {
        if (MSettings.jobs.length > 0) var schedule = require('node-schedule');

        for (var i = 0; i < MSettings.jobs.length; i++) {
            console.log('  - Scheduling job#' + i);
            var newjob = schedule.scheduleJob(MSettings.jobs[i].cron, function () {
                var ndx = this.name.substr(this.name.lastIndexOf(' ') + 1, 255).split('>')[0];
                ndx = ndx * 1 - 1;
                var _Task = require(PROJECT_SYSTEM + path.sep + '..' + path.sep + 'api' + path.sep + MSettings.jobs[ndx].api.split('.')[0] + ".js");
                _Task.DB = require(__dirname + path.sep + 'node_modules' + path.sep + "db" + path.sep + "DB.js");
                _Task.using = function (unit) {
                    if (fs.existsSync(__dirname + path.sep + 'node_modules' + path.sep + unit))
                        return require(__dirname + path.sep + 'node_modules' + path.sep + unit);
                };
                console.log('  --> Job start.');
                _Task[MSettings.jobs[ndx].api.split('.')[1]]({}, function () {
                    console.log('  --> Job done.');
                });
            });
        }
    };*/

    /**
    Mise en cluster
    **/

    // Interrogation du cluster via socket.io
    var cluster_host = registry.cluster.split(':')[0];
    if (registry.cluster.split(':').length > 1) var cluster_port = registry.cluster.split(':')[1];
    else var cluster_port = 80;

    authom.listen(app);

    /*
     */
    process.on('message', function (message, connection) {
        if (message !== 'sticky-session:connection') {
            return;
        }

        // Emulate a connection event on the server by emitting the
        // event with the connection the master sent us.
        http.emit('connection', connection);

        connection.resume();
    });



}
