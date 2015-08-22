var path = require('path');
var koa = require('koa');
var Router = require('koa-router');
var bodyParser = require('koa-bodyparser');
var views = require('koa-views');
var serve = require('koa-static');
var session = require('koa-session');
var passport = require('koa-passport');
var co = require('co');

// React
var React = require('react');
var ReactApp = require('./public/assets/server.js');

// Libraries
var Database = require('./lib/database');
var Passport = require('./lib/passport');

// Loading settings
var settings = require('./lib/config.js');
if (!settings) {
	console.error('Failed to load settings');
	process.exit(1);
}

var app = koa();

// Static file path
app.use(serve(path.join(__dirname, 'public')));

// Enabling BODY
app.use(bodyParser());

// Initializing authenication
Passport.init(passport);
Passport.local(passport);

if (settings.general.authorization.github.enabled)
	Passport.github(passport);

if (settings.general.authorization.facebook.enabled)
	Passport.facebook(passport);

if (settings.general.authorization.google.enabled)
	Passport.google(passport);

if (settings.general.authorization.linkedin.enabled)
	Passport.linkedin(passport);

app.use(passport.initialize());
app.use(passport.session());

// Create render
app.use(views(__dirname + '/views', {
	ext: 'jade',
	map: {
		html: 'jade'
	}
}));

// Initializing session mechanism
app.keys = settings.general.session.keys || [];
app.use(session(app));

// Initializing locals to make template be able to get
app.use(function *(next) {
	this.state.user = this.req.user || undefined;
	yield next;
});

// Get content which is rendered by react
function getContent(routePath, query) {

	return function(done) {
		var content = React.renderToString(React.createElement(ReactApp.main, { path: routePath }));

		done(null, content);
	};
}

// Routes
app.use(require('./routes/user').middleware());

// Initializing routes for front-end rendering
var router = new Router();
for (var index in ReactApp.routes) {
	var route = ReactApp.routes[index];

	// NotFound Page
	if (!route.path) {
		app.use(function *pageNotFound(next) {
			yield next;

			if (this.status != 404)
				return;

			if (this.body || !this.idempotent)
				return;

			// Rendering
			var content = yield getContent(this.request.path, this.query);
			yield this.render('index', { content: content });

			// Do not trigger koa's 404 handling
			this.message = null;
		});
		continue;
	}

	// Register path for pages
	router.get(route.path, function *() {

		// Reset initial state with session for new page
		ReactApp.context.setInitialState({
			User: this.state.user || {}
		});
		ReactApp.context.state.User.logined = this.isAuthenticated();

		// Rendering page and pass state to client-side
		var content = yield getContent(this.request.path, this.query);
		yield this.render('index', { content: content, state: ReactApp.context.state });
	});
}
app.use(router.middleware());

co(function *() {
	// Initializing database
	yield Database.init();

	app.listen(settings.general.server.port, function() {
		console.log('server is ready');
	});
});
