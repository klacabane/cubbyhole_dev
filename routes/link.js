var async = require('async'),
    mw = require('../tools/middlewares'),
    Utils = require('../tools/utils'),
    Item = require('../models/Item'),
    User = require('../models/User');

module.exports = function (app) {
    /**
     *  POST
     *  Make the resource public
     */
    app.post('/link/:id?', mw.checkAuth, mw.validateId, function (req, res) {
        var itemId = req.params.id || req.body.id;
        Item.findOne({_id: itemId}, function (err, item) {
            if (err) return res.send(500);
            if (!item) return res.send(404);

            User.hasPermissions({user: req.user, item: item, permissions: 1}, function (err, ok) {
                if (err) return res.send(500);
                if (!ok) return res.send(403);

                item.isPublic = true;
                item.lastModified = Date.now();
                item.link = {
                    url: '/sh/' + item._id,
                    creationDate: Date.now(),
                    recipients: []
                };

                item.save(function (err, uitem) {
                    if (err) return res.send(500);

                    res.send(200, {
                        data: uitem
                    });
                });
            });
        });
    });

    /**
     *  GET
     *  Return all links of authenticated user
     */
    app.get('/link', mw.checkAuth, function (req, res) {
        var user = req.user;
        Item.find({$or: [{'link.recipients._id': user}, {'owner': user}], isPublic: true})
            .lean()
            .populate('owner')
            .exec(function (err, items) {
                if (err) return res.send(500);

		        for (var i = 0, len = items.length; i < len; i++) {
			        var item = items[i];
			        item.owner = {_id: item.owner._id, email: item.owner.email};
		        }

                res.send(200, {
                    data: items
                });
            });
    });

    /**
     *  PUT
     *  Invite more users to a link
     */
    app.put('/link/:id?', mw.validateId, function (req, res) {
        var itemId = req.params.id || req.body.id,
            receivers = req.body.with || [];
        Item.findOne({_id: itemId}, function (err, item) {
            if (err) return res.send(500);
            if (!item) return res.send(404);
            if (!item.isPublic) return res.send(400, {error: 'Item is not public'});

            var token = req.get('X-Cub-AuthToken');
            var from = (token === undefined || !Utils.isTokenValid(token)) ? undefined : Utils.getTokenUser(token);

            async.waterfall([
                // Check if it's a CH user
                function (next) {
                    if (!from) return next(null, null);

                    User.findOne({_id: from}, next);
                },
                // Send mail to link recipients,
                // save membership if it's a CH user
                function (sender, cb) {
                    async.each(
                        receivers,
                        function (rec, callback) {
                            User.findOne({email: rec.email.toLowerCase().trim()}, function (err, user) {
                                if (err) return callback(err);

                                var details = {
                                    item: item,
                                    from: sender,
                                    link: item.link.url
                                };
                                Utils.sendEmail(rec, details, function (err) {
                                    if (err) console.log(err);
                                });

                                if (!user ||
                                    Utils.isMember(user._id.toString(), item.link.recipients) ||
                                    (sender && sender._id.toString() === user._id.toString()) ||
                                    user._id.toString() === item.owner.toString()) {
                                    // No need to save the relation here
                                    callback();
                                } else {
                                    // If it's a new CH recipient,
                                    // save his membership
                                    item.link.recipients.push({
                                        _id: user._id,
                                        email: user.email
                                    });

                                    item.save(callback);
                                }
                            });
                        },
                        cb);
                }
            ],
            function (err) {
                if (err) return res.send(500);
                res.send(200);
            });

        });
    });

    /**
     *  DELETE
     *  Make the item private if owner
     *  or delete membership if participant
     */
    app.delete('/link/:id', mw.checkAuth, mw.validateId, function (req, res) {
        var itemId = req.params.id,
            user = req.user;
        Item.findOne({_id: itemId}, function (err, item) {
            if (err) return res.send(500);
            if (!item) return res.send(404);

            if (Utils.isMember(user, item.link.recipients)) {
                item.removeLinkRecipient(user);
            } else if (user === item.owner.toString()) {
                item.isPublic = false;
                item.link = undefined;
                item.lastModified = Date.now();
            }

            if (item.isModified())
                item.save();

            res.send(200);
        });
    });
};
