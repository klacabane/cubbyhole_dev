var ItemShare = require('../models/ItemShare'),
    Item = require('../models/Item'),
    User = require('../models/User'),
    Notification = require('../models/Notification'),
    mw = require('../tools/middlewares'),
    Utils = require('../tools/utils'),
    async = require('async'),
    path = require('path');


module.exports = function (app) {
    /**
     * POST
     */
    app.post('/share/:id', mw.checkAuth, mw.validateId, function (req, res) {
        var itemId = req.params.id || req.body.id,
            receivers = req.body.with,
            from = req.user;

        async.parallel({
            item: function (callback) {
                Item.findOne({_id: itemId}, callback);
            },
            recipients: function (callback) {
                ItemShare.findOne({item: itemId})
                    .exec(function (err, ishare) {
                        if (err) return callback(err);

                        var fn = [];
                        // Validate receivers
                        receivers.forEach(function (r) {
                            fn.push(function (cb) {
                                User.findOne({email: r.email.toLowerCase().trim()})
                                    .lean()
                                    .exec(function (err, u) {
                                        if (err || !u || u._id == from || !u.verified) return cb(err);
                                        if (ishare && (u._id === ishare.owner._id
                                            || ishare.isMember(u._id))) return cb(); // Membership already exists

                                        // Receiver is a ch User and is not sharing this item yet
                                        // Create new membership
                                        Item.findOne({owner: u._id, isRoot: true}, function (err, rootFolder) {
                                            if (err) return cb(err);

                                            var member = {
                                                _id: u._id,
                                                email: u.email,
                                                accepted: false,
                                                permissions: r.permissions,
                                                custom: {
                                                    parent: rootFolder._id
                                                }
                                            };
                                            cb(null, member);
                                        });
                                    });
                            });
                        });

                        async.parallel(fn, function (err, members) {
                            callback(err, {ishare: ishare, members: members});
                        });
                    });
            },
            from: function (callback) {
                User.findOne({_id: from}, function (err, sender) {
                    if (err) return callback(err);
                    callback(null, {
                        _id: sender._id,
                        email: sender.email
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

                            Utils.sendEmail(recip, details, function (err) {
                            });
                            cb();
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

                            var membership = ishare.getMembership(from);
                            if (from !== ishare.owner._id.toString() &&
                                (membership && membership.permissions === 0)) return cb(403);

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

    /**
     * GET
     */
    app.get('/share/:id', mw.validateId, function (req, res) {

    });

    /**
     *  GET
     *  Returns all Shares of authenticated user
     */
    app.get('/share', mw.checkAuth, function (req, res) {
        var user = req.user;
        ItemShare.find({$or: [{'owner._id': user}, {'members._id': user}]})
            .populate('item')
            .exec(function (err, shares) {
                if (err) return res.send(500);

                var results = [];
                async.each(
                    shares,
                    function (share, callback) {
                        // Adjust ItemShare object properties
                        // with .path defaults to My Cubbyhole, .name
                        var shareObj = share.format();

                        share.item.getSize(function (err, size) {
                            if (err) return callback(err);

                            shareObj.meta = {size: size};

                            if (share.owner._id.toString() !== user) {
                                results.push(shareObj);
                                callback();
                            } else {
                                // if user is the owner,
                                // we overwrite path property with the actual folder path
                                share.item.getDirPath(function (err, dirPath) {
                                    if (err) return callback(err);

                                    var p = dirPath.split(path.sep);
                                    p.splice(0, 2, 'My Cubbyhole');
                                    shareObj.path = p.join(',');

                                    results.push(shareObj);
                                    callback();
                                });
                            }
                        });
                    },
                    function (err) {
                        if (err) return res.send(500);
                        res.send(200, {
                            data: results
                        });
                    });
            });
    });

    /**
     *  DELETE
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
                        if (user !== ishare.owner._id.toString()) return cb();

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

    /**
     *  PUT
     */
    app.put('/share/:id', mw.checkAuth, mw.validateId, function (req, res) {
        var itemId = req.params.id,
            member = req.body.member,
            permissions = req.body.permissions;

        ItemShare.findOne({item: itemId}, function (err, ishare) {
            if (err) return res.send(500);
            if (!ishare) return res.send(404);

            var membership = ishare.getMembership(member ? member : req.user);
            if (!membership) return res.send(403);

            // Sharing Confirmation
            if (!member)
                membership.accepted = true;
            else    // Update member permissions
                membership.permissions = permissions;

            ishare.save(function (err) {
                if (err) return res.send(500);
                res.send(200);
            });
        });
    });
};
