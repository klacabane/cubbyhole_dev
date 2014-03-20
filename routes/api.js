var User = require('../models/User'),
	Utils = require('../tools/utils'),
	Item = require('../models/Item'),
    ItemShare = require('../models/ItemShare'),
    mw = require('../tools/middlewares');

module.exports = function (app) {
    require('../routes/user')(app);
    require('../routes/plan')(app);
    require('../routes/item')(app);
    require('../routes/share')(app);
    require('../routes/link')(app);
    require('../routes/notification')(app);

    // Signin
    app.post('/auth/signin', function (req, res) {
    	var email = req.body.email,
    		pw = req.body.pass,
    		rememberMe = req.body.rememberMe;

    	if (!email || !pw) return res.send(400);

    	User.findOne({email: email.toLowerCase().trim()}, function (err, user) {
			if (err) return res.send(500);
			if (!user) return res.send(404);
            if (!user.isAllowed) return res.send(403);

			user.comparePw(pw, function (err, match) {
				if (err) return res.send(500);
				if (!match) return res.send(404);
				if (!user.verified) return res.send(401);

				var t = Utils.generateToken(user, rememberMe);
				res.send(200, {
					profile: {
						id: user._id,
						email: user.email,
						plan: user.currentPlan,
						token: t
					}
				});
			});
		});
    });

    // Register
    app.post('/auth/signup', function (req, res) {
		var email = req.body.email,
			pw = req.body.pass;

		if (!email || !pw) return res.send(400);

		User.findOne({email: email.toLowerCase().trim()}, function (err, user) {
			if (err) return res.send(500);
			if (user) return res.send(422);
			
			new User({email: email, password: pw})
				.save(function (err, u) {
					if (err) return res.send(500);
					
					Utils.sendEmail(u, function (err) {
						if (err) return res.send(500);

						res.send(201);
					})
				});
		});
    });

    // Verify token and render view
    app.get('/auth/confirm/:token', function (req, res) {
    	var user = Utils.getTokenUser(req.params.token);
    	if (!user) return res.render('index', {locals: {error: 'Invalid token.'}});

    	User.findOneAndUpdate({_id: user}, {$set: {verified: true}}, function (err, user) {
    		if (err) return res.render('index', {locals: {error: err}});
    		res.redirect('http://localhost:8000/index.html?email=' + user.email);
    	});
    });

    app.get('/share/confirm/:id/:token', mw.validateId, function (req, res) {
        var user = Utils.getTokenUser(req.params.token);
        if (!user) return res.render('index', {locals: {error: 'Invalid token.'}});

        ItemShare.findOne({item: req.params.id})
            .populate('item')
            .exec(function (err, ishare) {
                if (err) return res.render('index', {locals: {error: err}});

                ishare.getMembership(user)
                    .accepted = true;
                ishare.save(function (err) {
                    if (err) return res.render('index', {locals: {error: err}});

                    res.redirect('http://localhost:8000/webapp.html#/files?path=My Cubbyhole,' + ishare.item.name);
                });
            });
    });

};
