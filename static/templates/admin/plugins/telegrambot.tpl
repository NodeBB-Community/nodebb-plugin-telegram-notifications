<b>TelegramBot Token: </b>
<input type="text" id="telegramid">
<br>
<b>TelegramBot Message (You must use \{userid\} to send the user id to the user, without \): </b>
<input type="text" id="msg" placeholder="Your Telegram ID: \{userid\}">
<button onclick="saveTelegramToken()">Save</button>

<h3>You need restart your server to use the message and token.</h3>

<h2>Avaiable Commands:</h2>
<b>Reply to a topic: /r topicid reply</b>
<b>Send chat message: /chat userslug message</b>


<script type="text/javascript">
	socket.emit('admin.getTelegramToken',{}, function(err, data){
		if(data && data.token)
		{
			$("#telegramid").val(data.token);
			$("#msg").val(data.msg);
		}
	});


	var saveTelegramToken = function()
	{
		var id = $("#telegramid").val();
		var msg = $("#msg").val();
		socket.emit('admin.setTelegramToken', {token: id, msg:msg}, function(err, data){
			if(err)
			{
				alert("Error :(");
			}
			else
			{
				alert("Success!!");
			}
		});
	};
</script>
