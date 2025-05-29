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
}

