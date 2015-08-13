<p>Indica tu identificador de Telegram y podrás recibir las notificaciones a través de Telegram!
<br>
Para saber cual es tu ID, envía un mensaje por Telegram al bot del foro: @{botname}
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