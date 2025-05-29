/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import http from "http";
import https from "https";

const HttpMethod = {
    GET: "get",
    POST: "post",
};

const HttpStatus = {
    SUCCESS_RANGE_START: 200,
    SUCCESS_RANGE_END: 299,
    REDIRECT: 302,
    CLIENT_ERROR_RANGE_START: 400,
    CLIENT_ERROR_RANGE_END: 499,
    SERVER_ERROR_RANGE_START: 500,
    SERVER_ERROR_RANGE_END: 599,
};

const ProxyStatus = {
    SUCCESS_RANGE_START: 200,
    SUCCESS_RANGE_END: 299,
    SERVER_ERROR: 500,
};

/**
 * Constants
 */
const Constants = {
    AUTHORIZATION_PENDING: "authorization_pending",
};

class NetworkUtils {
    static getNetworkResponse(headers, body, statusCode) {
        return {
            headers: headers,
            body: body,
            status: statusCode,
        };
    }

    /*
     * Utility function that converts a URL object into an ordinary options object as expected by the
     * http.request and https.request APIs.
     */
    static urlToHttpOptions(url) {
        const options = {
            protocol: url.protocol,
            hostname: url.hostname && url.hostname.startsWith("[")
                ? url.hostname.slice(1, -1)
                : url.hostname,
            hash: url.hash,
            search: url.search,
            pathname: url.pathname,
            path: `${url.pathname || ""}${url.search || ""}`,
            href: url.href,
        };
        if (url.port !== "") {
            options.port = Number(url.port);
        }
        if (url.username || url.password) {
            options.auth = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
        }
        return options;
    }
}

/**
 * This class implements the API for network requests.
 */
export class HttpClientCurrent {
    constructor(proxyUrl, customAgentOptions) {
        this.proxyUrl = proxyUrl || "";
        this.customAgentOptions = customAgentOptions || {};
    }

    /**
     * Http Get request
     * @param url
     * @param options
     */
    async sendGetRequestAsync(url, options) {
        if (this.proxyUrl) {
            return networkRequestViaProxy(
                url,
                this.proxyUrl,
                HttpMethod.GET,
                options,
                this.customAgentOptions
            );
        } else {
            return networkRequestViaHttps(
                url,
                HttpMethod.GET,
                options,
                this.customAgentOptions
            );
        }
    }

    /**
     * Http Post request
     * @param url
     * @param options
     */
    async sendPostRequestAsync(url, options, cancellationToken) {
        if (this.proxyUrl) {
            return networkRequestViaProxy(
                url,
                this.proxyUrl,
                HttpMethod.POST,
                options,
                this.customAgentOptions,
                cancellationToken
            );
        } else {
            return networkRequestViaHttps(
                url,
                HttpMethod.POST,
                options,
                this.customAgentOptions
            );
        }
    }
	
	const networkRequestViaProxy = (
    destinationUrlString,
    proxyUrlString,
    httpMethod,
    options,
    agentOptions,
    timeout
) => {
    const destinationUrl = new URL(destinationUrlString);
    const proxyUrl = new URL(proxyUrlString);

    const headers = options?.headers || {};
    const tunnelRequestOptions = {
        host: proxyUrl.hostname,
        port: proxyUrl.port,
        method: "CONNECT",
        path: destinationUrl.hostname,
        headers: headers,
    };

    if (timeout) {
        tunnelRequestOptions.timeout = timeout;
    }

    if (agentOptions && Object.keys(agentOptions).length) {
        tunnelRequestOptions.agent = new http.Agent(agentOptions);
    }

    let postRequestStringContent = "";
    if (httpMethod === "POST") {
        const body = options?.body || "";
        postRequestStringContent =
            "Content-Type: application/x-www-form-urlencoded\r\n" +
            `Content-Length: ${body.length}\r\n` +
            `\r\n${body}`;
    }
    const outgoingRequestString =
        `${httpMethod.toUpperCase()} ${destinationUrl.href} HTTP/1.1\r\n` +
        `Host: ${destinationUrl.host}\r\n` +
        "Connection: close\r\n" +
        postRequestStringContent +
        "\r\n";

    return new Promise((resolve, reject) => {
        const request = http.request(tunnelRequestOptions);

        if (tunnelRequestOptions.timeout) {
            request.on("timeout", () => {
                request.destroy();
                reject(new Error("Request time out"));
            });
        }

        request.end();

        request.on("connect", (response, socket) => {
            const proxyStatusCode =
                response?.statusCode || 500; // Assuming 500 as ProxyStatus.SERVER_ERROR
            if (
                proxyStatusCode < 200 ||
                proxyStatusCode > 299
            ) {
                request.destroy();
                socket.destroy();
                reject(
                    new Error(
                        `Error connecting to proxy. Http status code: ${response.statusCode}. Http status message: ${response?.statusMessage || "Unknown"}`
                    )
                );
            }
            if (tunnelRequestOptions.timeout) {
                socket.setTimeout(tunnelRequestOptions.timeout);
                socket.on("timeout", () => {
                    request.destroy();
                    socket.destroy();
                    reject(new Error("Request time out"));
                });
            }

            socket.write(outgoingRequestString);

            const data = [];
            socket.on("data", (chunk) => {
                data.push(chunk);
            });

            socket.on("end", () => {
                const dataString = Buffer.concat(data).toString();
                const dataStringArray = dataString.split("\r\n");
                const httpStatusCode = parseInt(
                    dataStringArray[0].split(" ")[1]
                );
                // Further processing can be done here
            });
        });
    });
};


}

