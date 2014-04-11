cubbyhole_dev
=============

# Install


1) Download & install Python 2.7.6 (NOT THE 3.3!) http://www.python.org/getit/

2) Open a bash:

	npm install -g node-gyp

3) For Windows: Download & install OpenSSL for Windows (NOT THE LIGHT VERSION!) (Ex: Win64 OpenSSL v1.0.1f) http://slproweb.com/products/Win32OpenSSL.html

4) Git bash on the projet folder

	npm install


# Getting started

Open the mongod console and let it open and running

Git bash on the projet folder

	node app.js

# Changing IP Addresses

Open config.js & replace line 3, 16, 19

	address: "mongodb://localhost/Cubbyhole"

	api: {
        	address: "http://localhost:3000"
    	}

	webclient: {
        	address: "http://localhost:8000"
    	}
