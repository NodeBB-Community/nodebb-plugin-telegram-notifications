# Telegram Notifications

Allows NodeBB to send notifications over an TelegramBot!

## Installation

Enter to the directory of the plugin and execute:
	
	npm install

This will install all libs the plugin needs.

## Configuration

1. Install and activate this plugin.
2. [Create your Bot](https://core.telegram.org/bots/), and obtain your bot token
3. Enter the token into the plugin's setup page (`/admin/telegram`), and save.
4. Reload NodeBB.

## User Config
1. Talk to the bot and get user token
2. Go to yourdomain/telegram/settings and fill the token
3. Have fun

## Commands on telegram
Reply thread
 /r topicID message

Send chat
 /chat userslug message
 
Show Recent
/recent

Show last post on a topic
/read topicID (number of posts)

Known bugs: 
Reloading nodebb will keep several instances loaded, please use restart nodebb to run telegram plugin properly
If you have several instances of nodebb you must run the plugin on main instance with a port non set on other instances, can change mainport in library.js
