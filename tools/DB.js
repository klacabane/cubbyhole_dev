// mandatory modules/models
var mongoose = require('mongoose'),
	fs = require('fs'),
	User = require('../models/User'),
	Plan = require('../models/Plan'),
	UserPlan = require('../models/UserPlan'),
	Bandwidth = require('../models/Bandwidth'),
	async = require('async');

/*
 *	@DB
 */
var DB = function (username, password, address, local) {
	this._username = username;
	this._password = password;
	this._address = address;
	this._url = (local) ? 'mongodb://' + this._address : 'mongodb://' + this._username + ':' + this._password + this._address;
};

// connect
DB.prototype.connect = function (callback) {
    mongoose.connect(this._url, callback);
};

// disconnect
DB.prototype.disconnect = function (callback) {
	mongoose.disconnect(callback);
};

DB.prototype.dropDatabase = function (callback) {
	mongoose.connection.db.dropDatabase(callback);
};

// insertPlanAndBw
// overwrites plans and bandwidths with datas defined in datas/planAndBw.json
DB.prototype.insertPlanAndBw = function (callback) {
	fs.readFile('./datas/planAndBw.json', function (err, data) {
		data = JSON.parse(data);

		Plan.removeAll( function (err) {
			if (err) callback(err);
			var bwCount = data.bandwidths.length,
				planCount = data.plans.length;
			data.bandwidths.forEach( function (bwArgs) {
				var bw = new Bandwidth(bwArgs);
				bw.save( function (err) {
					if (err) callback(err);
					if (--bwCount == 0)
						data.plans.forEach( function (planArgs) {
							var plan = new Plan(planArgs);
							plan.save( function (err) {
								if (err) callback(err);
								if (--planCount == 0)
									callback();
							});
						});
				});
			});
		});
	});
};

// addFixtures
// generates user fixtures with datas defined in datas/fixtures.json
// TODO: add UserDailyTransfer/UserPlans datas
DB.prototype.addFixtures = function (callback) {
	fs.readFile('./datas/fixtures.json', function (err, data) { 
		data = JSON.parse(data);
		
		var userCount = data.users.length;
		data.users.forEach( function (userArgs) {
			User.add(userArgs, function () {
				if (--userCount == 0)
					callback();
			});
		});
		
	});
};

if (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined') { module.exports = DB; }