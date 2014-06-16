var async = require('async'),
    User = require('../models/User'),
    Utils = require('../tools/utils'),
    Item = require('../models/Item'),
    ItemShare = require('../models/ItemShare'),
    mw = require('../tools/middlewares'),
    cfg = require('../config.js'),
    cache = require('../tools/cache'),
    geoip = require('geoip');

module.exports = function (app) {
    require('../routes/user')(app);
    require('../routes/plan')(app);
    require('../routes/item')(app);
    require('../routes/share')(app);
    require('../routes/link')(app);
    require('../routes/notification')(app);

    // GeoLiteCity.dat weighs a ton
    // var city = new geoip.City('./datas/GeoLiteCity.dat');
    /**
     *  POST
     *  Signin
     *  @errors
     *  404: user not found
     *  403: account is disabled
     *  401: email is not verified
     */
    app.post('/auth/signin', function (req, res) {
        var email = req.body.email,
            pw = req.body.pass,
            rememberMe = req.body.rememberMe;

        if (!Utils.isValidString(email) || !Utils.isValidString(pw)) return res.send(400);

        User.findOne({email: email.toLowerCase().trim(), deleted: false}, function (err, user) {
            if (err) return res.send(500);
            if (!user) return res.send(404);
            if (!user.isAllowed) return res.send(403);

            user.comparePw(pw, function (err, match) {
                if (err) return res.send(500);
                if (!match) return res.send(404);
                if (!user.verified) return res.send(401);

                var tkn = Utils.generateToken(user, rememberMe);
                res.send(200, {
                    profile: {
                        id: user._id,
                        email: user.email,
                        plan: user.currentPlan,
                        token: tkn
                    }
                });
            });
        });
    });

    /**
     *  POST
     *  Signup
     *  @errors
     *  422: email already taken
     */
    app.post('/auth/signup', function (req, res) {
        var email = req.body.email,
            pw = req.body.pass,
            ip = req.body.ip;

        if (!Utils.isValidString(email) || !Utils.isValidString(pw)) return res.send(400);

        async.parallel({
            location: function (next) {
                next();
                /* city.lookup(ip, function (err, locData) {
                    next(null, locData);
                }); */
            },
            emailTaken: function (next) {
                User.findOne({email: email.toLowerCase().trim(), deleted: false}, next);
            }
        }, function (err, result) {
            if (err) return res.send(500);
            if (result.emailTaken) return res.send(422);

            var location = result.location || {};
            new User({email: email, password: pw, verified: false, location: location})
                .save(function (err, newUser) {
                    if (err) return res.send(500);

                    Utils.sendEmail(newUser, function (err) {
                        if (err) console.log(err);
                    });

                    res.send(201);
                });
        });
    });

    /**
     *  GET
     *  Confirm email address
     */
    app.get('/auth/confirm/:token', function (req, res) {
    	var user = Utils.getTokenUser(req.params.token);
    	if (!user) return res.render('index', {locals: {error: 'Invalid token.'}});

    	User.findOneAndUpdate({_id: user}, {$set: {verified: true}}, function (err, user) {
            if (err) return res.render('index', {locals: {error: 'Something went wrong.'}});
            res.redirect(cfg.webclient.address + '/index.html?email=' + user.email);
    	});
    });

    /**
     *  GET
     *  Confirm item sharing
     */
    app.get('/share/confirm/:id/:token', mw.validateId, function (req, res) {
        var user = Utils.getTokenUser(req.params.token);
        if (!user) return res.render('index', {locals: {error: 'Invalid token.'}});

        ItemShare.findOne({item: req.params.id})
            .populate('item')
            .exec(function (err, ishare) {
                if (err) return res.render('index', {locals: {error: 'Something went wrong.'}});

                var membership = ishare.getMembership(user);
                if (!membership) return res.render('index', {locals: {error: "You're not part of this sharing anymore."}});

                membership.accepted = true;
                ishare.save(function (err) {
                    if (err) return res.render('index', {locals: {error: 'Something went wrong.'}});

                    res.redirect(cfg.webclient.address + '/webapp.html#/files?path=My Cubbyhole,' + ishare.item.name);
                });
            });
    });

    /**
     *  GET
     *  Returns api documentation
     */
    app.get('/documentation', mw.checkAuth, function (req, res) {
        res.send(200, cache.store.ApiDocumentation);
    });
};
