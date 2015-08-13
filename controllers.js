var Pushbullet = require('./library'),
	meta = module.parent.parent.require('./meta'),
	nconf = module.parent.parent.require('nconf'),

	Controllers = {};

Controllers.renderACP = function(req, res) {
	Pushbullet.getAssociatedUsers(function(err, users) {
		res.render('admin/plugins/pushbullet', {
			users: users,
			numAssoc: users.length,
			url: nconf.get('url')
		});
	});
};

Controllers.renderAuthSuccess = function(req, res) {
	res.render('pushbullet/assocSuccess');
};

Controllers.renderSettings = function(req, res) {
	Pushbullet.getUserDevices(req.user.uid, function(err, devices) {
		res.render('pushbullet/settings', {
			"site_title": meta.config.title || meta.config.browserTitle || 'NodeBB',
			setupRequired: res.locals.setupRequired,
			devices: devices
		});
	});
};

module.exports = Controllers;