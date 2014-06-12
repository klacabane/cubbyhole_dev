var fs = require('fs'),
    Utils = require('../tools/utils'),
    Plan = require('../models/Plan'),
    Bandwidth = require('../models/Bandwidth');

var Cache = {
    store: {
        Plans: [],
        Bandwidths: [],
        ApiDocumentation: null,
        _plans: {},
        _bandwidths: {},
        _tokenBlacklist: []
    },
    init: function (callback) {
        this.store.Plans = [];
        this.store.Bandwidths = [];
        this.store._plans = {};
        this.store._bandwidths = {};
        Bandwidth.find({}, 'download upload')
            .exec(function (err, bws) {
                Cache._addBandwidths(bws);

                Plan.find({}, 'bandwidth name price duration storage sharedQuota isMutable')
                    .exec(function (err, plans) {
                        Cache._addPlans(plans);
                        if (callback) callback(err);
                    });
            });
    },
    addDocumentation: function (callback) {
        fs.readFile('./routes/endpoints.json', 'utf-8', function (err, endpoints) {
            if (endpoints)
                Cache.store.ApiDocumentation = JSON.parse(endpoints);

            if (callback) callback(err);
        });
    },
    _addPlans: function (plans) {
        for (var i = 0, length = plans.length; i < length; i ++) {
            var plan = plans[i].toObject();
                plan.bandwidth = Cache.store._bandwidths[plan.bandwidth];

            Cache.store._plans[plan._id] = plan;
            Cache.store.Plans.push(plan);
        }
    },
    _addBandwidths: function (bws) {
        for (var i = 0, length = bws.length; i < length; i ++) {
            var bw = bws[i].toObject();
            Cache.store._bandwidths[bw._id] = bw;
            Cache.store.Bandwidths.push(bw);
        }
    },
    getPlan: function (id) {
        return this.store._plans[id];
    },
    getBandwidth: function (id) {
        return this.store._bandwidths[id];
    },
    blacklistToken: function (token) {
        this.store._tokenBlacklist.push(token);
    },
    isBlacklisted: function (token) {
        var blacklisted = false;
        for (var i = 0, length = this.store._tokenBlacklist.length; i < length; i++) {
            var blTkn = this.store._tokenBlacklist[i];
            if (blTkn === token) {
                blacklisted = true;
                break;
            }
        }
        return blacklisted;
    }
};

module.exports = Cache;
