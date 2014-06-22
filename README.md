cubbyhole_dev
=============

# Install


1) Download & install Python 2.7.6 (NOT THE 3.3!) http://www.python.org/getit/

2) Open a bash:

	npm install -g node-gyp

3) For Windows: Download & install OpenSSL for Windows (NOT THE LIGHT VERSION!) (Ex: Win64 OpenSSL v1.0.1f) http://slproweb.com/products/Win32OpenSSL.html

4) Install MongoDB. For CentOS:

Create a /etc/yum.repos.d/mongodb.repo file to hold the following configuration information for the MongoDB repository:

	[mongodb]
	name=MongoDB Repository
	baseurl=http://downloads-distro.mongodb.org/repo/redhat/os/x86_64/
	gpgcheck=0
	enabled=1
	
Install mongodb:

	sudo yum install mongodb-org
	
	sudo chkconfig mongod on
	
	sudo service mongod restart

5) Install NodeJS. For CentOS:

	yum install nodejs

6) Git bash on the projet folder

	npm install


# Getting started

Open the mongod console and let it open and running

Git bash on the projet folder

	node app.js
	
# Adding Fixtures

Open app.js and uncomment lines 47 to 52:

	/** Uncomment to populate db with new Plans & Bws */
    	/*
	Utils.insertPlanAndBw(function (err) {
		if (err) throw err;
	});
	*/

Launch the API (see Getting Started above)

Stop the API.


Re-open app.js and comment lines 47 to 52

Re-launch the API. Fixtures are added.

# Changing IP Addresses

Open config.js & replace line 3, 16, 19

	address: "mongodb://localhost/Cubbyhole"

	api: {
        	address: "http://localhost:3000"
    	}

	webclient: {
        	address: "http://localhost:8000"
    	}

with

	address: "mongodb://localhost/Cubbyhole"

	api: {
        	address: "http://10.0.0.25:3000"
    	}

	webclient: {
        	address: "http://10.0.0.20:8000"
    	}
