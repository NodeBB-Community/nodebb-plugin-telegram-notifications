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
	moment = require('./lib/moment.min.js'),
	pubsub = module.parent.require('./pubsub'),
	privileges = module.parent.require('./privileges'),

	Telegram = {};
var SocketAdmins = module.parent.require('./socket.io/admin');

var TelegramBot = require('node-telegram-bot-api');

var token = null;
var message = null;
var messageQueue = {};

Telegram.init = function(params, callback) {
	var middleware = params.middleware,
	controllers = params.controllers;

	// Prepare templates
	controllers.getTelegramBotAdmin = function (req, res, next) {
		// Renders template (*Renderiza la plantilla)
		res.render('admin/plugins/telegrambot', {});
	};
	controllers.getTelegramBotSettings = function (req, res, next) {
		// Renders template (*Renderiza la plantilla)
		pubsub.on('telegram:me', function(me){
			res.render('telegrambot/telegramusersettings', {botname:me.username});
		});
		pubsub.publish('telegram:getMe');
	};

	// Create urls
	params.router.get('/admin/telegrambot', middleware.buildHeader, controllers.getTelegramBotAdmin);
	params.router.get('/api/admin/telegrambot', controllers.getTelegramBotAdmin);
	params.router.get('/telegram/settings', Telegram.isLoggedIn, middleware.buildHeader, controllers.getTelegramBotSettings);
	params.router.get('/api/telegram/settings', Telegram.isLoggedIn, controllers.getTelegramBotSettings);

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

	// Start the bot only on the primary instance.
	if(nconf.get('isPrimary') === 'true' && !nconf.get('jobsDisabled') && !global.telegram)
	{
		startBot();
	}
	else
	{	// at least get token in all instances to prepare&show menus
		db.getObject('telegrambot-token', function(err, t)
		{
			if(err || !t)
			{
				return;
			}

			token = t.token;
			message = t.msg;
		});
	}

	callback();
};

function startBot()
{
	// Prepare bot
	db.getObject('telegrambot-token', function(err, t){
		if(err || !t)
		{
			return;
		}

		token = t.token;
		message = t.msg;
		messageQueue = {};

		// Setup polling way
		var bot = global.telegram = new TelegramBot(token, {polling: true});

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
				var messageToSend = message.replace("{userid}", msg.from.id)+"\n"+
                                    "type /bothelp for commands";
				bot.sendMessage(msg.chat.id, messageToSend);
			}
		});

		// Notification observer.
		pubsub.on('telegram:notification', function(data){
			bot.sendMessage(data.telegramId, data.message).catch(function(){});
		});

		// Settings observer.
		pubsub.on('telegram:getMe', function(){
			bot.getMe().then(function(me){
				pubsub.publish('telegram:me', me);
			}).catch(function(){});
		});
	});
}

var parseCommands = function(telegramId, mesg)
{
	function respond(response) {
		pubsub.publish('telegram:notification', {telegramId: telegramId, message: response});
	}

	function respondWithTranslation(uid, response) {
		Telegram.getUserLanguage(uid, function(lang){
			translator.translate(response, lang, function(translated) {
				respond(translated);
			});
		});
	}

	if(mesg.indexOf("/") == 0)
	{

		db.sortedSetScore('telegramid:uid', telegramId, function(err, uid){
			if(err || !uid)
			{
				return respond("UserID not found.. Put your TelegramID again in the telegram settings of the forum. :(");
			}

			var command = mesg.split(" "); // Split command
			if(command[0].toLowerCase() == "/r" && command.length >= 3)
			{	// It's a reply to a topic!
				var data = {};
				data.uid = uid;
				data.tid = command[1];
				command.splice(0, 2); // Delete /r and topic id, only keep the message
				data.content = command.join(" "); // recover the message

				if(messageQueue[data.uid]){
					// check queue to avoid race conditions and flood with many posts
					// Get user language to send the error
					respondWithTranslation(uid, "[[error:too-many-messages]]");
					return;
				}

				// update queue
				messageQueue[data.uid] = true;

				topics.reply(data, function(err, postData){
					delete messageQueue[data.uid];
					if(err){
						// Get user language to send the error
						respondWithTranslation(uid, err.message);
						return;
					}
					respondWithTranslation(uid, "[[success:topic-post]]");
					return;
				});
			}
/* chat command kills nodebb, so disable it until it's fixed
*
			else if(command[0].toLowerCase() == "/chat" && command.length >= 3)
			{	// It's a reply to a topic!
				var data = {};
				user.getUidByUserslug(command[1], function(err, touid){
					if(err || !touid)
					{
						return respond("Error: UserID "+command[1]+" not found);
					}
					data.fromuid = uid;
					command.splice(0, 2); // Delete /chat and username, only keep the message
					data.content = command.join(" "); // recover the message
					messaging.addMessage(uid, touid, data.content, function(err, r){
						if(err)
						{
							respond("Error..");
						}
						else
						{
							respondWithTranslation(uid, "[[success:success]]");
						}
					});
				});
			}
*/
			else if(command[0].toLowerCase() == "/recent")
			{
				var data = {};
				var numTopics = command[1] || 10;
				numTopics = Math.min(30, numTopics);
				topics.getTopicsFromSet('topics:recent', uid, 0, Math.max(1, numTopics), function(err, topics) {
					if (err)
					{
						return respond("Error..");
					}

					var response = "";
					topics = topics.topics;

					for(var i in topics)
					{
						var title = topics[i].title;
						var tid = topics[i].tid;
						var user = topics[i].user.username;
						var time = moment.unix(topics[i].lastposttime / 1000).fromNow();
						var url = nconf.get("url") + "/topic/" + tid;
						response += title + " " + time + " by " + user + "\n" + url + "\n\n";
					}

					respond(response);
				});
			}
			else if(command[0].toLowerCase() == "/read" && command.length >= 2)
			{
				var data = {};
				var tid = command[1];
				privileges.topics.get(tid, uid, function(err, data){
					var canRead = data['topics:read'];
					
					if(!canRead)
					{
						return respondWithTranslation(uid, "[[error:no-privileges]]");;
					}

					topics.getPids(tid, function(err, pids){
						posts.getPostsByPids(pids, uid, function(err, posts){
							if (err)
							{
								return respond("Error..");
							}

							var postsuids = [];

							for(var i in posts)
							{
								postsuids.push(posts[i].uid);
							}

							user.getUsersFields(postsuids, ["username"], function(err, usernames){
								var response = "";
								var numPosts = 10;
								var start = posts.length-numPosts > 0 ? posts.length-numPosts : 0;
								for(var i=start; i<posts.length;i++)
								{
									var username = usernames[i].username;
									var content = posts[i].content;
									content = content.replace(/\<[^\>]*\>/gi, "");
									var tid = posts[i].tid;
									var time = moment.unix(posts[i].timestamp / 1000).fromNow();
									response = content + " \n " + time + " by " + username + "\n\n";

									respond(response);
								}
							});
							
						});
					});
				});
			}
			else if (command[0].toLowerCase() == "/bothelp")
            {
                
                 var response = "I understand the following commands:\n"+
                            "/recent [<number>]\t- list recent <number> posts.  (Default = 10)\n"+
                            "/r \t\t<TopicId>  \t- respond to forum topic <TopicId>\n"+
                            "/read \t <TopicId> \t- read latest posts form Topic <TopicId>\n";
                 respond(response);
                            
            }
			else respond ("Sorry, I don't understand "+command+" please try again");
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

	if (!Array.isArray(uids) || !uids.length || !notifObj)
	{
		return;
	}

	if(notifObj.nid && notifObj.nid.indexOf("post_flag") > -1)
	{	// Disable notifications from flags.
		return;
	}

	// Send notification for each user.
	user.getUsersFields(uids, ["telegramid"], function(err, usersData){

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
						postIndex: async.apply(posts.getPidIndex, notifObj.pid, notifObj.tid, ''),
						topicSlug: async.apply(topics.getTopicFieldByPid, 'slug', notifObj.pid)
					}, next);
				},
				function(data, next) {
					// Send notification
					var title = data.title;
					var url = nconf.get('url') + notifObj.path;
					var body = title + "\n\n" + notifObj.bodyLong + "\n\n" + url;

					winston.verbose('[plugins/telegram] Sending notification to uid ' + uid);
					pubsub.publish('telegram:notification', {telegramId: telegramId, message: body});

					cb(); // Go next user in array (async.eachSeries)
				}
			]);
		});
	});
};

// Add button in profile
Telegram.addProfileItem = function(data, callback) {
	if (token) {
		data.links.push({
			id: 'telegram',
			route: '../../telegram/settings',
			icon: 'fa-mobile',
			name: 'Telegram',
			public: false
		});
	}

	callback(null, data);
};

Telegram.addNavigation = function(custom_header, callback) {
// Adding to admin menu access to see logs (*Añadimos al menu de admin el acceso a ver los registros)
	custom_header.plugins.push({
		route: '/telegrambot',
		icon: '',
		name: 'Telegram Notifications'
	});

	callback(null, custom_header);
}


Telegram.isLoggedIn = function(req, res, next) {
	// Check if user is logged in (for middleware)
	if (req.user && parseInt(req.user.uid, 10) > 0)
	{
		next();
	}
	else
	{
		res.redirect('403');
	}
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
