<form role="form" class="telegram-notification-settings">
	<div class="row">
		<div class="col-sm-2 col-xs-12 settings-header">[[telegram-notification:webhook]]</div>
		<div class="col-sm-10 col-xs-12">
			<div class="form-group">
				<label for="telegramid">[[telegram-notification:telegramid]]</label>
				<input type="text" class="form-control" id="telegramid" name="telegramid" />
				<p class="help-block">[[telegram-notification:webhook-help]]</p>
			</div>
		</div>
	</div>
	
	<!-- not sure if we need the userID here, as we set a user ID in user settings
	<div class="row">
		<div class="col-sm-2 col-xs-12 settings-header">[[telegram-notification:userId]]</div>
		<div class="col-sm-10 col-xs-12">
			<div class="form-group">
				<label for="userId">[[telegram-notification:userId]]</label>
				<input type="text" class="form-control" id="userId" name="userId" />
				<p class="help-block">[[telegram-notification:telegramSendUser-help]]</p>
			</div>
		</div>
	</div>
	-->
	
	<div class="row">
		<div class="col-sm-2 col-xs-12 settings-header">[[telegram-notification:notification]]</div>
		<div class="col-sm-10 col-xs-12">
			<div class="form-group">
				<label for="maxLength">[[telegram-notification:notification-max-length]]</label>
				<input type="number" class="form-control" id="maxLength" name="maxLength" min="1" max="1024" value="100" />
				<p class="help-block">[[telegram-notification:notification-max-length-help]]</p>
			</div>
			<div class="form-group">
				<label for="postCategories">[[telegram-notification:post-categories]]</label>
				<select class="form-control" id="postCategories" name="postCategories" size="10" multiple></select>
			</div>
			<div class="checkbox">
				<label for="topicsOnly" class="mdl-switch mdl-js-switch mdl-js-ripple-effect">
					<input type="checkbox" class="mdl-switch__input" id="topicsOnly" name="topicsOnly" />
					<span class="mdl-switch__label">[[telegram-notification:topics-only]]</span>
				</label>
			</div>
			<div class="form-group">
				<label for="messageContent">[[telegram-notification:message]] <small>([[telegram-notification:message-sidenote]])</small></label>
				<textarea class="form-control" id="messageContent" name="messageContent" maxlength="512"></textarea>
				<p class="help-block">[[telegram-notification:message-help]]</p>
			</div>
		</div>
	</div>
</form>

<button id="save" class="floating-button mdl-button mdl-js-button mdl-button--fab mdl-js-ripple-effect mdl-button--colored">
	<i class="material-icons">save</i>
</button>

<script>
	$(document).ready(function() {
		socket.emit('categories.get', function(err, data) {
			categories = data;
			for (var i = 0; i < categories.length; ++i) {
				$('#postCategories').append('<option value=' + categories[i].cid + '>' + categories[i].name + '</option>');
			}
		});
	});

	require(['settings'], function(Settings) {
		Settings.load('telegram-notification', $('.telegram-notification-settings'));

		$('#save').on('click', function() {
			Settings.save('telegram-notification', $('.telegram-notification-settings'), function() {
				app.alert({
					type: 'success',
					alert_id: 'telegram-notification-saved',
					title: 'Settings Saved',
					message: 'Please reload your NodeBB to apply these settings',
					clickfn: function() {
						socket.emit('admin.reload');
					}
				});
			});
		});
	});
</script>

