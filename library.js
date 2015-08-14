"use strict";

var db = module.parent.require('./database'),
	meta = module.parent.require('./meta'),
	user = module.parent.require('./user'),
	posts = module.parent.require('./posts'),
	topics = module.parent.require('./topics'),
	messaging = module.parent.require('./messaging'),
	SocketPlugins = module.parent.require('./socket.io/plugins'),
	winston = module.parent.require('winston'),
	nconf = module.parent.require('nconf'),
	async = module.parent.require('async'),
	S = module.parent.require('string'),
	cache = require('lru-cache'),
	lang_cache,
	translator = module.parent.require('../public/src/modules/translator'),

	Telegram = {};
var SocketAdmins = module.parent.require('./socket.io/admin');

var TelegramBot = require('node-telegram-bot-api');

var token = null;
var message = null;
var bot = null;

Telegram.init = function(params, callback) {
	var middleware = params.middleware,
	controllers = params.controllers;
	// Prepare templates
	controllers.getTelegramBotAdmin = function (req, res, next) {
		// Renderiza la plantilla
		res.render('admin/plugins/telegrambot', {});
	};
	controllers.getTelegramBotSettings = function (req, res, next) {
		// Renderiza la plantilla
		bot.getMe().then(function(me){
			res.render('telegrambot/settings', {botname:me.username});
		});
	};

	// Create urls
	params.router.get('/admin/telegrambot', middleware.buildHeader, controllers.getTelegramBotAdmin);
	params.router.get('/api/admin/telegrambot', controllers.getTelegramBotAdmin);
	params.router.get('/telegram/settings', middleware.buildHeader, controllers.getTelegramBotSettings);
	params.router.get('/api/telegram/settings', controllers.getTelegramBotSettings);

	// User language cache
	db.getObjectField('global', 'userCount', function(err, numUsers) {
		var	cacheOpts = {
				max: 50,
				maxAge: 1000 * 60 * 60 * 24
			};

		if (!err && numUsers > 0) {
			cacheOpts.max = Math.floor(numUsers / 20);
		}
		lang_cache = cache(cacheOpts);
	});

	startBot();

	callback();
};

function startBot()
{
	// For multiple instances servers!!
	var port = nconf.get('port');
	var mainPort = 4567; // Main instace port, only one instance can reply and parse commands!
	// Prepare bot
	db.getObject('telegrambot-token', function(err, t){
		if(err || !t)
		{
			return callback();
		}

		token = t.token;
		message = t.msg;
		// Setup polling way
		bot = new TelegramBot(token, {polling: true});

		if(port == mainPort)
		{	// Only parse commands and reply on main instance!!
			bot.on('text', function (msg) {
				var chatId = msg.chat.id;
				var userId = msg.from.id;
				var username = msg.from.username;
				var text = msg.text;
				if(!message)
				{
					message = "Your Telegram ID: {userid}";
				}
				if(text.indexOf("/") == 0)
				{
					parseCommands(userId, text);
				}
				else
				{
					var messageToSend = message.replace("{userid}", msg.from.id);
					bot.sendMessage(msg.chat.id, messageToSend);
				}
			});
		}
	});
}

var parseCommands = function(telid, mesg)
{
	if(mesg.indexOf("/") == 0)
	{
		db.sortedSetScore('telegramid:uid', telid, function(err, uid){
			if(err || !uid)
			{
				return bot.sendMessage(telid, "UserID not found.. Put your TelegramID again in the telegram settings of the forum. :(");
			}
			var command = mesg.split(" "); // Split command
			if(command[0].toLowerCase() == "/r" && command.length >= 3)
			{	// It's a reply to a topic!
				var data = {};
				data.uid = uid;
				data.tid = command[1];
				command.splice(0, 2); // Delete /r and topic id, only keep the message
				data.content = command.join(" "); // recover the message
				posts.create(data, function(err, r){
					if(err)
					{
						bot.sendMessage(telid, "Error..");
					}
					else
					{
						bot.sendMessage(telid, "OK!");
					}
				});
			}
			else if(command[0].toLowerCase() == "/chat" && command.length >= 3)
			{	// It's a reply to a topic!
				var data = {};
				user.getUidByUserslug(command[1], function(err, touid){
					if(err || !touid)
					{
						return bot.sendMessage(telid, "Error..");
					}
					data.fromuid = uid;
					command.splice(0, 2); // Delete /chat and username, only keep the message
					data.content = command.join(" "); // recover the message
					messaging.addMessage(uid, touid, data.content, function(err, r){
						if(err)
						{
							bot.sendMessage(telid, "Error..");
						}
						else
						{
							bot.sendMessage(telid, "OK!");
						}
					});
				});
			}
		});
	}
};

Telegram.getUserLanguage = function(uid, callback) {
	if (lang_cache && lang_cache.has(uid)) {
		callback(null, lang_cache.get(uid));
	} else {
		user.getSettings(uid, function(err, settings) {
			var language = settings.language || meta.config.defaultLang || 'en_GB';
			callback(null, language);
			lang_cache.set(uid, language);
		});
	}
};

Telegram.pushNotification = function(data) {
	var notifObj = data.notification;
	var uids = data.uids;

	//console.log(data);

	if (!Array.isArray(uids) || !uids.length || !notifObj)
	{
		return;
	}

	if(notifObj.nid && notifObj.nid.indexOf("post_flag") > -1)
	{	// Disable notifications from flags.
		return;
	}

	// Send notification for each user.
	user.getMultipleUserFields(uids, ["telegramid"], function(err, usersData){
		//console.log(usersData);
		async.eachSeries(usersData, function iterator(user, cb){
			var telegramId = user.telegramid;
			var uid = user.uid;

			async.waterfall([
				function(next){
					// Get user language
					Telegram.getUserLanguage(uid, next);
				},
				function(lang, next) {
					// Prepare notification with the user language
					notifObj.bodyLong = notifObj.bodyLong || '';
					notifObj.bodyLong = S(notifObj.bodyLong).unescapeHTML().stripTags().unescapeHTML().s;
					async.parallel({
						title: function(next) {
							translator.translate(notifObj.bodyShort, lang, function(translated) {
								next(undefined, S(translated).stripTags().s);
							});
						},
						postIndex: async.apply(posts.getPidIndex, notifObj.pid, uid),
						topicSlug: async.apply(topics.getTopicFieldByPid, 'slug', notifObj.pid)
					}, next);
				},
				function(data, next) {
					// Send notification
					/*
					var	payload = {
							device_iden: settings['pushbullet:target'] && settings['pushbullet:target'].length ? settings['pushbullet:target'] : null,
							type: 'link',
							title: data.title,
							url: notifObj.path || nconf.get('url') + '/topic/' + data.topicSlug + '/' + data.postIndex,
							body: notifObj.bodyLong
						};
					*/
					var title = data.title;
					var url = notifObj.path || nconf.get('url') + '/topic/' + data.topicSlug + '/' + data.postIndex;
					var body = title + "\n\n" + notifObj.bodyLong + "\n\n" + url;

					winston.verbose('[plugins/telegram] Sending notification to uid ' + uid);
					bot.sendMessage(telegramId, body);
					cb(); // Go next user in array (async.eachSeries)
				}
			]);
		});
	});
};

// Add button in profile
Telegram.addProfileItem = function(links, callback) {
	if (token) {
		links.push({
			id: 'telegram',
			route: '../../telegram/settings',
			icon: 'fa-mobile',
			name: 'Telegram',
			public: false
		});
	}

	callback(null, links);
};

Telegram.addNavigation = function(custom_header, callback) {
// Añadimos al menu de admin el acceso a ver los registros
	custom_header.plugins.push({
		route: '/telegrambot',
		icon: '',
		name: 'Telegram Notifications'
	});

	callback(null, custom_header);
}


// Sockets
SocketAdmins.setTelegramToken = function (socket, data, callback)
{
	var t = {token:data.token, msg:data.msg};
	db.setObject('telegrambot-token', data, callback);
}

SocketAdmins.getTelegramToken = function (socket, data, callback)
{
	db.getObject('telegrambot-token', callback);
}

SocketPlugins.setTelegramID = function (socket, data, callback)
{
	user.getUserField(socket.uid, "telegramid", function(err, telid){
		if(telid)
		{
			db.sortedSetRemove("telegramid:uid", telid); // Remove previus index
		}
		user.setUserField(socket.uid, "telegramid", data, function(err){
			if(data && data != "")
			{
				var obj = { value: data, score:socket.uid };
				db.sortedSetAdd("telegramid:uid", socket.uid, data, callback); // Index to get uid from telegramid
			}
			else
			{
				callback(null, "");
			}
		});
	});
}

SocketPlugins.getTelegramID = function (socket, data, callback)
{
	user.getUserField(socket.uid, "telegramid", callback);
}


module.exports = Telegram;
