var ItemShare = require('../models/ItemShare'),
    Item = require('../models/Item'),
    User = require('../models/User'),
    Notification = require('../models/Notification'),
    mw = require('../tools/middlewares'),
    Utils = require('../tools/utils'),
    async = require('async'),
    path = require('path');


module.exports = function (app) {
    /*
     * POST
     *
     */
    app.post('/share/:id', mw.checkAuth, mw.validateId, function (req, res) {
        var itemId = req.params.id,
            receivers = req.body.with,
            from = req.user,
            isPublic = req.isPublic == 'true';

        async.parallel({
            item: function (callback) {
                Item.findOne({_id: itemId}, callback);
            },
            recipients: function (callback) {
                ItemShare.findOne({item: itemId})
                    .populate('owner')
                    .exec(function (err, ishare) {
                        if (err) return callback(err);

                        var fn = [];
                        // Validate receivers
                        receivers.forEach(function (r) {
                            fn.push(function (cb) {
                                User.findOne({email: r.email})
                                    .lean()
                                    .exec(function (err, u) {
                                        if (err || !u || u._id == from || !u.verified) return cb(err);
                                        if (ishare && (u._id === ishare.owner._id
                                            || ishare.isMember(u._id))) return cb(); // Membership already exists

                                        // Receiver is a ch User and is not sharing this item yet
                                        // Create new membership
                                        var member = {
                                            _id: u._id,
                                            email: u.email,
                                            accepted: false,
                                            permissions: r.permissions
                                        };
                                        cb(null, member);
                                    });
                            });
                        });

                        async.parallel(fn, function (err, members) {
                            callback(err, {ishare: ishare, members: members});
                        });
                    });
            },
            from: function (callback) {
                User.findOne({_id: from}, function (err, from) {
                    if (err) return callback(err);
                    callback(null, {
                        _id: from._id,
                        email: from.email
                    });
                });
            }
        }, function (err, results) {
            if (err) return res.send(500);
            if (!results.item) return res.send(404);

            var members = Utils.cleanArray(results.recipients.members),
                item = results.item;

            // No valid members
            if (!members.length) return res.send(422);

            // Create a notification
            // and send mail to each participant
            async.each(
                members,
                function (recip, callback) {
                    async.parallel([
                        function (cb) {
                            new Notification({
                                type: 'S',
                                user: recip._id,
                                from: results.from,
                                item: {_id: item._id, name: item.name, type: item.type},
                                share: item._id
                            }).save(cb);
                        },
                        function (cb) {
                            var details = {
                                item: item,
                                from: results.from,
                                share: item._id
                            };

                            Utils.sendEmail(recip, details, cb);
                        }
                    ], callback);
                },
                function (err) {
                    if (err) return res.send(500);

                    var ishare = results.recipients.ishare;

                    // Update sharing or create a new one
                    async.series([
                        function (cb) {
                            if (!ishare) return cb();
                            if (from != ishare.owner._id &&
                                ishare.getMembership(from).permissions === 0) return cb(403);

                            // Update existing sharing members
                            ishare.members = ishare.members.concat(members);
                            ishare.save(function (err, is) {
                                cb(err, is);
                            });
                        }, function (cb) {
                            if (ishare) return cb();

                            // Update item.isShared property and
                            // Create a new ItemShare
                            item.setShared(true, function (err) {
                                if (err) return cb(err);

                                new ItemShare({item: item._id, owner: results.from, members: members})
                                    .save(function (err, is) {
                                        cb(err, is);
                                    });
                            });
                        }
                    ],
                    function (err, result) {
                        if (err) return res.send(typeof err === 'number' ? err : 500);
                        var itemShare = Utils.cleanArray(result)[0];

                        item.getDirPath(function (err, dirPath) {
                            if (err) return res.send(500);

                            var obj = itemShare.format(),
                                p = dirPath.split(path.sep);
                            p.splice(0, 2, 'My Cubbyhole');
                            obj.path = p.join(',');
                            obj._id = item._id;
                            obj.name = item.name;

                            res.send(201, {
                                data: obj
                            });
                        });
                    });
                });
        });
    });

    /*
     * GET
     */
    app.get('/share/:id', mw.validateId, function (req, res) {
        ItemShare.findOne({_id: req.params.id})
            .populate('item')
            .exec(function (err, itemShare) {
                if (err) return res.send(500);
                if (!itemShare) return res.send(404);

                if (itemShare.public)
                    res.send(201, {
                        data: ishare.item
                    });
                else
                    mw.checkAuth(req, res, function () {
                        if (req.user !== itemShare.with.toString()) return res.send(403);

                        res.send(201, {
                            data: itemShare.item
                        });
                    });
            });
    });

    app.get('/share', mw.checkAuth, function (req, res) {
        var user = req.user;
        ItemShare.find({$or: [{'owner._id': user}, {'members._id': user}]})
            .populate('item')
            .exec(function (err, shares) {
                if (err) return res.send(500);

                var results = [];
                async.each(
                    shares,
                    function (s, callback) {
                        var obj = s.format();

                        // Shared items are at the root folder of participants
                        if (s.owner._id.toString() !== user) {
                            results.push(obj);
                            callback();
                        } else {
                            s.item.getDirPath(function (err, dirPath) {
                                if (err) return callback(err);

                                var p = dirPath.split(path.sep);
                                p.splice(0, 2, 'My Cubbyhole');
                                obj.path = p.join(',');

                                results.push(obj);
                                callback();
                            });
                        }
                    },
                    function (err) {
                        if (err) return res.send(500);
                        res.send(200, {
                            data: results
                        });
                    });
            });
    });

    /*
     * DELETE
     */
    app.delete('/share/:id/:member?', mw.checkAuth, mw.validateId, function (req, res) {
        var itemId = req.params.id,
            member = req.params.member;
        ItemShare.findOne({item: itemId}, function (err, ishare) {
                if (err) return res.send(500);
                if (!ishare) return res.send(404);

                var user = req.user;
                async.parallel([
                    function (cb) {
                        if (user != ishare.owner._id) return cb();

                        // User is the owner
                        // if a member is given, only delete his membership
                        if (member) {
                            ishare.removeMember(member);
                            ishare.save(cb);
                        } else {
                            ishare.remove(cb);
                        }
                    },
                    function (cb) {
                        if (!ishare.isMember(user)) return cb();

                        // User is a member,
                        // delete his membership
                        ishare.removeMember(user);
                        ishare.save(cb);

                    }
                ], function (err) {
                    if (err) return res.send(500);
                    res.send(200);
                });
            });
    });

    /*
     * PUT
     */
    app.put('/share/:id', mw.checkAuth, mw.validateId, function (req, res) {
        var itemId = req.params.id,
            member = req.body.member,
            permissions = req.body.permissions;

        ItemShare.findOne({item: itemId}, function (err, ishare) {
            if (err) return res.send(500);
            if (!ishare) return res.send(404);

            // Sharing Confirmation
            if (!member)
                ishare.getMembership(req.user)
                    .accepted = true;
            else    // Update member permissions
                ishare.getMembership(member)
                    .permissions = permissions;

            ishare.save(function (err) {
                if (err) return res.send(500);
                res.send(200);
            });
        });
    });
};
