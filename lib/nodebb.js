"use strict";

// This is just a place to store references to NodeBB classes.
// Alternatively you could do something like require('../../../src/database') from your modules
// ...but that's pretty messy

var NodeBB = {};

(function(parent) {
	NodeBB = {
		db: parent.require('../src/database'),
		user: parent.require('../src/user'),
		groups: parent.require('../src/groups'),
        nconf:  parent.require('nconf'),
        user:   parent.require('../src/user')
	};
}(module.parent.parent));

module.exports = NodeBB;
