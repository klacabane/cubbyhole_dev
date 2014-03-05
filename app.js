/**
 * Module dependencies
 */
var express = require('express'),
	routes = require('./routes'),
	http = require('http'),
	path = require('path'),
	Utils = require('./tools/utils'),
	mongoose = require('mongoose'),
	cfg = require('./config'),
    mw = require('./tools/middlewares'),
	fs = require('fs');

var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.set('view options', {
    layout: false
});
app.use(express.static(__dirname + '/public'));
app.use(express.bodyParser({limit: '1000mb'}));
app.use(mw.setHeaders);
app.use(app.router);
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

// Open database connection
mongoose.connect(cfg.db.address, function (err) {
	if (err) throw err;
	Utils.insertPlanAndBw(function (err) {
		if (err) throw err;
	});
});

// fake storage folder
fs.exists(cfg.storage.dir, function (exists) {
	if (!exists) fs.mkdirSync(cfg.storage.dir);
});

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

/**
 * Routes
 */
app.get('/', routes.index);

app.options('*', function(req, res) {
	return res.send(200);
});

/**
 * JSON API
 */
require('./routes/api')(app);

// DEFAULT: redirect all other routes to the index page
app.get('*', routes.index);