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
                Item.findOne({_id: itemId})
                    .populate('owner')
                    .exec(callback);
            },
            recipients: function (callback) {
                var fn = [];
                receivers.forEach(function (r) {
                    fn.push(function (cb) {
                        User.findOne({mail: r.email})
                            .lean()
                            .exec(function (err, u) {
                                if (err) return cb(err);
                                if (!u || u._id.toString() === from) return cb();

                                ItemShare.findOne({$or: [{'owner._id': u._id}, {'with': u._id}], item: itemId}, function (err, ishare) {
                                    if (err) return cb(err);
                                    if (ishare) return cb();

                                    u.permissions = r.permissions;
                                    cb(null, u);
                                });
                            });
                    });
                });

                async.parallel(fn, callback);
            },
            from: function (callback) {
                User.findOne({_id: from}, callback);
            }
        }, function (err, results) {
            if (err) return res.send(500);
            if (!results.item || !results.recipients) return res.send(404);

            var notesFn = [],
                item = results.item;
            results.recipients.forEach(function (recip) {
                if (recip) {
                    // Persist a notification and send an email to the members
                    notesFn.push(function (callback) {
                        new ItemShare({item: itemId, with: recip._id, owner: {_id: item.owner._id, email: item.owner.mail}, permissions: recip.permissions, public: isPublic})
                            .save(function (err, itemShare) {
                                if (err) return callback(err);

                                async.parallel([
                                    function (cb) {
                                        new Notification({
                                            type: 'S',
                                            user: recip._id,
                                            from: from,
                                            item: {name: results.item.name, type: results.item.type},
                                            share: itemShare._id
                                        }).save(cb);
                                    },
                                    function (cb) {
                                        var details = {
                                            item: results.item,
                                            from: results.from,
                                            share: itemShare._id
                                        };

                                        Utils.sendEmail(recip, details, cb);
                                    }
                                ], function (err) {
                                    if (err) return callback(err);
                                    callback(null, itemShare);
                                });
                            });
                    });
                }
            });

            async.parallel(notesFn, function (err, itemShares) {
                if (err) return res.send(500);
                if (!itemShares.length) return res.send(422); // No valid member

                item.isShared = true;
                item.save(function (err) {
                    itemShares[0].formatWithMembers(function (err, obj) {
                        if (err) return res.send(500);

                        item.getDirPath(function (err, dirPath) {
                            if (err) return cb(err);

                            var p = dirPath.split(path.sep);
                            p.splice(0, 2, 'My Cubbyhole');
                            obj.path = p.join(',');

                            res.send(201, {
                                data: obj
                            });
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
        ItemShare.find({$or: [{'owner._id': user}, {'with': user}]})
            .populate('item')
            .exec(function (err, shares) {
                if (err) return res.send(500);

                var fn = [],
                    itemsId = [];
                shares.forEach(function (s) {
                    if (itemsId.indexOf(s.item.toString()) === -1) {    // hmmm
                        itemsId.push(s.item.toString());

                        fn.push(function (cb) {
                            s.formatWithMembers(function (err, obj) {
                                if (err) return cb(err);

                                // Shared folders are at the rootfolder of the participants
                                if (s.owner._id != user)
                                    cb(null, obj);
                                else
                                    s.item.getDirPath(function (err, dirPath) {
                                        if (err) return cb(err);

                                        var p = dirPath.split(path.sep);
                                        p.splice(0, 2, 'My Cubbyhole');
                                        obj.path = p.join(',');

                                        cb(null, obj);
                                    });
                            });
                        });
                    }
                });

                async.parallel(fn, function (err, sharedItems) {
                    if (err) return res.send(500);
                    res.send(200, {
                        data: sharedItems
                    });
                });
            });
    });

    /*
     * DELETE
     */
    app.delete('/share/:id', mw.checkAuth, mw.validateId, function (req, res) {
        var itemId = req.params.id,
            member = req.body.member;
        ItemShare.findOne({item: itemId}, function (err, ishare) {
            if (err) return res.send(500);
            if (!ishare) return res.send(404);

            ishare.formatWithMembers(function (err, obj) {
                if (err) return res.send(500);

                var user = req.user;
                async.parallel([
                    function (cb) {
                        if (user != obj.owner._id) return cb();
                        var members = obj.members;

                        // User is the owner,
                        // delete all sharing with this item
                        // and set isShared to false
                        if (member) members = [].push({_id: member});

                        async.each(
                            members,
                            function (m, callback) {
                                ItemShare.findOne({item: itemId, with: m._id}, function (err, mshare) {
                                    if (err) return callback(err);
                                    mshare.remove(callback);
                                });
                            },
                            function (err) {
                                if (err) return cb(err);

                                if (obj.members.length > 1)
                                    cb()
                                else
                                    Item.findByIdAndUpdate(itemId, {isShared: false}, cb);
                            });
                        /*var fn = [];
                        obj.members.forEach(function (member) {
                            fn.push(function (callback) {
                                ItemShare.findOne({item: itemId, with: member._id}, function (err, mshare) {
                                    if (err) return callback(err);
                                    mshare.remove(callback);
                                });
                            });
                        });
                        async.parallel(fn, function (err) {
                            if (err) return cb(err);

                            Item.findByIdAndUpdate(itemId, {isShared: false}, cb);
                        });*/
                    },
                    function (cb) {
                        if (!Utils.isMember(obj.members, user)) return cb();

                        // User is a member,
                        // delete his sharing
                        // and set isShared to false if he was the only participant
                        ItemShare.findOne({item: itemId, with: user}, function (err, ushare) {
                            if (err) return cb(err);

                            ushare.remove(function (err) {
                                if (err) return cb(err);

                                if (obj.members.length > 1)
                                    cb();
                                else
                                    Item.findByIdAndUpdate(itemId, {isShared: false}, cb);
                            });
                        });
                    }
                ], function (err) {
                    if (err) return res.send(500);
                    res.send(200);
                });
            });
        });
    });

    /*
     * PUT
     */
    app.put('/share/:id', mw.checkAuth, mw.validateId, function (req, res) {
        ItemShare.findOne({item: req.params.id, with: req.user}, function (err, ishare) {
            if (err) return res.send(500);
            if (!ishare) return res.send(404);

            ishare.accepted = true;
            ishare.save(function (err) {
                if (err) return res.send(500);
                res.send(200);
            });
        });
    });
};
