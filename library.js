(function(module) {
"use strict";

require('./lib/nodebb.js');

var Telegram = {};

var db = module.parent.require('./database'),
	meta = module.parent.require('./meta'),
	User = module.parent.require('./user'),
	posts = module.parent.require('./posts'),
	Topics = module.parent.require('./topics'),
	Categories = module.parent.require('./categories'),
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

	Settings = require('./lib/userSettings.js')(Telegram),
 //   SocketAdmins = module.parent.require('./socket.io/admin');

    TelegramBot = require('node-telegram-bot-api');

var bot = null;
var token = null;
var message = null;
var messageQueue = {};
var plugin = {
			config: {
				telegramid: '',
                chatid:'',
                roomId:'',
				maxLength: '',
				postCategories: '',
				topicsOnly: '',
				messageContent: ''
			}
};
            
Telegram.init = function(params, callback) {
	var middleware = params.middleware,
	controllers = params.controllers;
	// Prepare templates
	controllers.getTelegramBotAdmin = function (req, res, next) {
		// Renders template (*Renderiza la plantilla)
		res.render('admin/plugins/telegrambot', {});
	};
    // prepare parameter and start the bot
	controllers.getTelegramBotSettings = function (req, res, next) {
		// Renders template (*Renderiza la plantilla)
		pubsub.on('telegram:me', function(me){
			res.render('user/settings', {botname:me.username});
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

    // get settings
    meta.settings.get('telegram-notification', function(err, settings) {
			for (var prop in plugin.config) {
				if (settings.hasOwnProperty(prop)) {
					plugin.config[prop] = settings[prop];
                }
            }
			token = plugin.config['telegramid'];

	// Start the bot only on the primary instance and if a bot token is configured
	if(nconf.get('isPrimary') === 'true' && !nconf.get('jobsDisabled') && !global.telegram && token)
	{
		startBot();
	}
	else
	{	 // at least get token in all instances to prepare&show menus
//		db.getObject('telegrambot-token', function(err, t)
//		{
//			if(err || !t)
//			{
//				return;
//			}

			message = plugin.config['messagecontent'];
//		});
	}
    });

	callback();
};

function startBot()
{
	// Prepare bot
		
		messageQueue = {};
        //console.log("Token; "+token);

		// Setup polling way
		 bot = global.telegram = new TelegramBot(token,{polling: true});

		bot.on('text', function (msg) {
			var chatId = msg.chat.id;
			var userId = msg.from.id;
			var username = msg.from.username;
			var text = msg.text;
            if (plugin.config['chatid'] == '')
            {
                plugin.config['chatid'] = chatId;
            }
            
			if(!message)
			{
				message = "\n Hello this is the ForumBot\n\n"+
                          "I am your interface to the "+
                          "Feathercoin Forum (https://forum.feathercoin.com).\n\n"+
                          "Your Telegram ID: {userid}\n"+
                          "ID of this chat:<b> "+msg.chat.id+ "</b>\n"+
                          "Open a chat with me and type /bothelp to see, what I can do for you\n";
			}
			if(text.indexOf("/") == 0)
			{
				parseCommands(userId, text);
			}
			else
            {   
           //     if (msg.text == "@ForumBot")
                if (text.toLowerCase() == "@forumbot")
                {
                    var messageToSend = message.replace("{userid}", msg.from.id);
                    bot.sendMessage(msg.chat.id, messageToSend);
                }
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
}   // function startbot


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
            console.log(err,uid);
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

				Topics.reply(data, function(err, postData){
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
				var numtopics = command[1] || 10;
				numtopics = Math.min(30, numtopics);
				Topics.getTopicsFromSet('topics:recent', uid, 0, Math.max(1, numtopics), function(err, topics) {
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

					Topics.getPids(tid, function(err, pids){
						posts.getPostsByPids(pids, uid, function(err, posts){
							if (err)
							{
								return respond("Error: Coulld not get Posts from topic");
							}

							var postsuids = [];

							for(var i in posts)
							{
								postsuids.push(posts[i].uid);
							}

							User.getUsersFields(postsuids, ["username"], function(err, usernames){
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
                            "/r \t\t\t<TopicId>  \t- respond to forum topic <TopicId>\n"+
                            "/read \t\t <TopicId> \t- read latest posts form Topic <TopicId>\n";
                 respond(response);
                            
            }
			else respond ("Sorry, I don't understand "+command+" please try again");
		});
	}
};

	
Telegram.postSave = function(post) {
		post = post.post;
        var roomId= -plugin.config['roomId'];
		var topicsOnly = plugin.config['topicsOnly'] || 'off';
		if (topicsOnly === 'off' || (topicsOnly === 'on' && post.isMain)) {
			var content = post.content;
           

			async.parallel({
				user: function(callback) {
					User.getUserFields(post.uid, ['username', 'picture'], callback);
				},
				topic: function(callback) {
					Topics.getTopicFields(post.tid, ['title', 'slug'], callback);
				},
				category: function(callback) {
					Categories.getCategoryFields(post.cid, ['name', 'bgColor'], callback);
				}
			}, function(err, data) {
				var categories = JSON.parse(plugin.config['postCategories']);
				if (!categories || categories.indexOf(String(post.cid)) >= 0) {
					// Trim long posts:
					var maxQuoteLength = plugin.config['maxLength'] || 1024;
					if (content.length > maxQuoteLength) { content = content.substring(0, maxQuoteLength) + '...'; }

					// Ensure absolute thumbnail URL:
					var thumbnail = data.user.picture.match(/^\//) ? forumURL + data.user.picture : data.user.picture;

					// Add custom message:
					var messageContent = plugin.config['messageContent']+"\n"+content;
                    
                         
/*
					// Make the rich embed:
					var embed = new Discord.RichEmbed()
						.setColor(data.category.bgColor)
						.setURL(forumURL + '/topic/' + data.topic.slug)
						.setTitle(data.category.name + ': ' + data.topic.title)
						.setDescription(content)
						.setFooter(data.user.username, thumbnail)
						.setTimestamp();
*/
					// Send notification:
					if (bot) {
                       bot.sendMessage(roomId,messageContent).catch(console.error);
					}
					else console.log ("Telegram: No bot found:");
				}
			});
		}
	},

Telegram.getUserLanguage = function(uid, callback) {
	if (lang_cache && lang_cache.has(uid)) {
		callback(null, lang_cache.get(uid));
	} else {
		User.getSettings(uid, function(err, settings) {
			var language = settings.language || meta.config.defaultLang || 'en_GB';
			callback(null, language);
			lang_cache.set(uid, language);
		});
	}
};

/*  changed notification mechanism
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
						topicSlug: async.apply(Topics.getTopicFieldByPid, 'slug', notifObj.pid)
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
*/



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




module.exports = Telegram;

}(module));
