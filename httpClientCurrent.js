// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const http = require("http");
const https = require("https");

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

const Constants = {
    AUTHORIZATION_PENDING: "authorization_pending",
};

class NetworkUtils {
    static getNetworkResponse(headers, body, statusCode) {
        return {
            headers,
            body,
            status: statusCode,
        };
    }

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

class HttpClientCurrent {
    constructor(proxyUrl, customAgentOptions) {
        this.proxyUrl = proxyUrl || "";
        this.customAgentOptions = customAgentOptions || {};
    }

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
                this.customAgentOptions,
                cancellationToken
            );
        }
    }
}

function networkRequestViaProxy(destinationUrlString, proxyUrlString, httpMethod, options, agentOptions, timeout) {
    const destinationUrl = new URL(destinationUrlString);
    const proxyUrl = new URL(proxyUrlString);

    const headers = options?.headers || {};
    const tunnelRequestOptions = {
        host: proxyUrl.hostname,
        port: proxyUrl.port,
        method: "CONNECT",
        path: destinationUrl.hostname,
        headers,
    };

    if (timeout) {
        tunnelRequestOptions.timeout = timeout;
    }

    if (agentOptions && Object.keys(agentOptions).length) {
        tunnelRequestOptions.agent = new http.Agent(agentOptions);
    }

    let postRequestStringContent = "";
    if (httpMethod === HttpMethod.POST) {
        const body = options?.body || "";
        postRequestStringContent =
            "Content-Type: application/x-www-form-urlencoded\r\n" +
            `Content-Length: ${body.length}\r\n\r\n${body}`;
    }

    const outgoingRequestString =
        `${httpMethod.toUpperCase()} ${destinationUrl.href} HTTP/1.1\r\n` +
        `Host: ${destinationUrl.host}\r\n` +
        "Connection: close\r\n" +
        postRequestStringContent + "\r\n";

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
            const proxyStatusCode = response?.statusCode || ProxyStatus.SERVER_ERROR;
            if (
                proxyStatusCode < ProxyStatus.SUCCESS_RANGE_START ||
                proxyStatusCode > ProxyStatus.SUCCESS_RANGE_END
            ) {
                request.destroy();
                socket.destroy();
                return reject(new Error(`Error connecting to proxy. Http status code: ${response.statusCode}. Http status message: ${response?.statusMessage || "Unknown"}`));
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
            socket.on("data", (chunk) => data.push(chunk));
            socket.on("end", () => {
                const dataString = Buffer.concat(data).toString();
                const dataStringArray = dataString.split("\r\n");
                const httpStatusCode = parseInt(dataStringArray[0].split(" ")[1]);
                const statusMessage = dataStringArray[0].split(" ").slice(2).join(" ");
                const body = dataStringArray[dataStringArray.length - 1];
                const headersArray = dataStringArray.slice(1, dataStringArray.length - 2);

                const entries = new Map();
                headersArray.forEach((header) => {
                    const headerKeyValue = header.split(new RegExp(/:\s(.*)/s));
                    const headerKey = headerKeyValue[0];
                    let headerValue = headerKeyValue[1];
                    try {
                        const object = JSON.parse(headerValue);
                        if (object && typeof object === "object") {
                            headerValue = object;
                        }
                    } catch (e) { }
                    entries.set(headerKey, headerValue);
                });

                const headers = Object.fromEntries(entries);
                const networkResponse = NetworkUtils.getNetworkResponse(
                    headers,
                    parseBody(httpStatusCode, statusMessage, headers, body),
                    httpStatusCode
                );

                if (
                    (httpStatusCode < HttpStatus.SUCCESS_RANGE_START || httpStatusCode > HttpStatus.SUCCESS_RANGE_END) &&
                    networkResponse.body["error"] !== Constants.AUTHORIZATION_PENDING
                ) {
                    request.destroy();
                }

                resolve(networkResponse);
            });

            socket.on("error", (chunk) => {
                request.destroy();
                socket.destroy();
                reject(new Error(chunk.toString()));
            });
        });

        request.on("error", (chunk) => {
            request.destroy();
            reject(new Error(chunk.toString()));
        });
    });
}

function networkRequestViaHttps(urlString, httpMethod, options, agentOptions, timeout) {
    const isPostRequest = httpMethod === HttpMethod.POST;
    const body = options?.body || "";

    const url = new URL(urlString);
    const headers = options?.headers || {};
    let customOptions = {
        method: httpMethod,
        headers,
        ...NetworkUtils.urlToHttpOptions(url),
    };

    if (timeout) {
        customOptions.timeout = timeout;
    }

    if (agentOptions && Object.keys(agentOptions).length) {
        customOptions.agent = new https.Agent(agentOptions);
    }

    if (isPostRequest) {
        customOptions.headers = {
            ...customOptions.headers,
            "Content-Length": body.length,
        };
    }

    return new Promise((resolve, reject) => {
        const request = https.request(customOptions);

        if (timeout) {
            request.on("timeout", () => {
                request.destroy();
                reject(new Error("Request time out"));
            });
        }

        if (isPostRequest) {
            request.write(body);
        }

        request.end();

        request.on("response", (response) => {
            const headers = response.headers;
            const statusCode = response.statusCode;
            const statusMessage = response.statusMessage;

            const data = [];
            response.on("data", (chunk) => data.push(chunk));
            response.on("end", () => {
                const body = Buffer.concat(data).toString();

                const networkResponse = NetworkUtils.getNetworkResponse(
                    headers,
                    parseBody(statusCode, statusMessage, headers, body),
                    statusCode
                );

                if (
                    (statusCode < HttpStatus.SUCCESS_RANGE_START || statusCode > HttpStatus.SUCCESS_RANGE_END) &&
                    networkResponse.body["error"] !== Constants.AUTHORIZATION_PENDING
                ) {
                    request.destroy();
                }

                resolve(networkResponse);
            });
        });

        request.on("error", (chunk) => {
            request.destroy();
            reject(new Error(chunk.toString()));
        });
    });
}

function parseBody(statusCode, statusMessage, headers, body) {
    let parsedBody;
    try {
        parsedBody = JSON.parse(body);
    } catch (error) {
        let errorType;
        let errorDescriptionHelper;
        if (statusCode >= HttpStatus.CLIENT_ERROR_RANGE_START && statusCode <= HttpStatus.CLIENT_ERROR_RANGE_END) {
            errorType = "client_error";
            errorDescriptionHelper = "A client";
        } else if (statusCode >= HttpStatus.SERVER_ERROR_RANGE_START && statusCode <= HttpStatus.SERVER_ERROR_RANGE_END) {
            errorType = "server_error";
            errorDescriptionHelper = "A server";
        } else {
            errorType = "unknown_error";
            errorDescriptionHelper = "An unknown";
        }

        parsedBody = {
            error: errorType,
            error_description: `${errorDescriptionHelper} error occured.\nHttp status code: ${statusCode}\nHttp status message: ${statusMessage || "Unknown"}\nHeaders: ${JSON.stringify(headers)}`
        };
    }

    return parsedBody;
}

module.exports = { HttpClientCurrent };
