<div class="text">
	<label>[[telegram:telegramId]]</label>
	<input type="text" data-property="telegramId" id="telegramId" name="telegramId" />
</div>



<!--
<p>Put your telegram ID and you'll be able to receive the notifications through Telegram!
<br>
To find out your ID, just send a telegram message to the forum bot : <a href="http://telegram.me/{botname}" target="_blank">@{botname}</a>

</p>
<b>Telegram ID: </b>
<input type="text" id="telegramid">
<button onclick="saveTelegramId()">Save</button>


<script type="text/javascript">

	var saveTelegramId = function()
	{
		var id = $("#telegramid").val();
		socket.emit('plugins.setTelegramID', id, function(err, data){
			if(err)
			{
				alert("Error saving your telegram ID :(");
			}
			else
			{
				alert("Success!");
			}
		});
	};

	socket.emit('plugins.getTelegramID',{}, function(err, data){
		$("#telegramid").val(data);
	});
</script>
-->
