var config = {
	db: {
		address: "mongodb://localhost/Cubbyhole",
		username: "",
		password: ""
	},
	token: {
		secret: "secret",
		expiration: 1,
		expiration_long: 365
	},
	storage: {
		dir: "./storage"
	},
    api: {
        address: "http://localhost:3000"
    },
    webclient: {
        address: "http://localhost:8000"
    },
    paypal: {
        host: "api.sandbox.paypal.com",
        port: "",
        client_id: "AQHJThC8lhAk3c2TPfUq3qwfBV3ZxisaqXOv1EKTeGlAlgcGdh6ucTXXK1Kg",
        client_secret: "EL3avRC7yM-FIIq0znW0dtczif7VGaMLAlHshJfZSiYNXmgSa5Y2y2oiZYpw"
    }
};

module.exports = config;

