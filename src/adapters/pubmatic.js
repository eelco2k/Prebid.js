var utils = require('../utils.js');
var bidfactory = require('../bidfactory.js');
var bidmanager = require('../bidmanager.js');

/**
 * Adapter for requesting bids from Pubmatic.
 *
 * @returns {{callBids: _callBids}}
 * @constructor
 */
var PubmaticAdapter = function PubmaticAdapter() {

  var bids;
  var _pm_pub_id;
  var _pm_optimize_adslots = [];

  function _callBids(params) {
    bids = params.bids;
    for (var i = 0; i < bids.length; i++) {
      var bid = bids[i];
      bidmanager.pbCallbackMap['' + bid.params.adSlot] = bid;
      _pm_pub_id = _pm_pub_id || bid.params.publisherId;
      _pm_optimize_adslots.push(bid.params.adSlot);
    }

    // Load pubmatic script in an iframe, because they call document.write
    _getBids();
  }

  function _getBids() {

    // required variables for pubmatic pre-bid call
    window.pm_pub_id = _pm_pub_id;
    window.pm_optimize_adslots = _pm_optimize_adslots;

    //create the iframe
    var iframe = utils.createInvisibleIframe();
    var elToAppend = document.getElementsByTagName('head')[0];

    //insert the iframe into document
    elToAppend.insertBefore(iframe, elToAppend.firstChild);

    //todo make this more browser friendly
    var iframeDoc = iframe.contentWindow.document;
    iframeDoc.write(_createRequestContent());
    iframeDoc.close();
  }

  function _createRequestContent() {
    var content = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"' +
      ' "http://www.w3.org/TR/html4/loose.dtd"><html><head><base target="_top" /><scr' +
      'ipt>inDapIF=true;</scr' + 'ipt></head>';
    content += '<body>';
    content += '<scr' + 'ipt>';
    content += '' +
      'window.pm_pub_id  = "%%PM_PUB_ID%%";' +
      'window.pm_optimize_adslots     = [%%PM_OPTIMIZE_ADSLOTS%%];';
    content += '</scr' + 'ipt>';

    var map = {};
    map.PM_PUB_ID = _pm_pub_id;
    map.PM_OPTIMIZE_ADSLOTS = _pm_optimize_adslots.map(function (adSlot) {
      return "'" + adSlot + "'";
    }).join(',');

    content += '<scr' + 'ipt src="https://ads.pubmatic.com/AdServer/js/gshowad.js"></scr' + 'ipt>';
    content += '<scr' + 'ipt>';
    content += 'window.parent.pbjs.handlePubmaticCallback({progKeyValueMap: progKeyValueMap,' +
      ' bidDetailsMap: bidDetailsMap})';
    content += '</scr' + 'ipt>';
    content += '</body></html>';
    content = utils.replaceTokenInString(content, map, '%%');

    return content;
  }

  pbjs.handlePubmaticCallback = function (response) {
    var i;
    var adUnit;
    var adUnitInfo;
    var bid;
    var bidResponseMap = (response && response.bidDetailsMap) || {};
    var bidInfoMap = (response && response.progKeyValueMap) || {};
    var dimensions;

    for (i = 0; i < bids.length; i++) {
      var adResponse;
      bid = bids[i].params;

      adUnit = bidResponseMap[bid.adSlot] || {};

      // adUnitInfo example: bidstatus=0;bid=0.0000;bidid=39620189@320x50;wdeal=

      // if using DFP GPT, the params string comes in the format:
      // "bidstatus;1;bid;5.0000;bidid;hb_test@468x60;wdeal;"
      // the code below detects and handles this.
      if (bidInfoMap[bid.adSlot].indexOf('=') === -1) {
        bidInfoMap[bid.adSlot] = bidInfoMap[bid.adSlot].replace(/([a-z]+);(.[^;]*)/ig, '$1=$2');
      }

      adUnitInfo = (bidInfoMap[bid.adSlot] || '').split(';').reduce(function (result, pair) {
        var parts = pair.split('=');
        result[parts[0]] = parts[1];
        return result;
      }, {});

      if (adUnitInfo.bidstatus === '1') {
        dimensions = adUnitInfo.bidid.split('@')[1].split('x');
        adResponse = bidfactory.createBid(1);
        adResponse.bidderCode = 'pubmatic';
        adResponse.adSlot = bid.adSlot;
        adResponse.cpm = Number(adUnitInfo.bid);
        adResponse.ad = unescape(adUnit.creative_tag);  // jshint ignore:line
        adResponse.adUrl = unescape(adUnit.tracking_url); // jshint ignore:line
        adResponse.width = dimensions[0];
        adResponse.height = dimensions[1];
        adResponse.dealId = adUnitInfo.wdeal;

        bidmanager.addBidResponse(bids[i].placementCode, adResponse);
      } else {
        // Indicate an ad was not returned
        adResponse = bidfactory.createBid(2);
        adResponse.bidderCode = 'pubmatic';
        bidmanager.addBidResponse(bids[i].placementCode, adResponse);
      }
    }
  };

  return {
    callBids: _callBids
  };

};

module.exports = PubmaticAdapter;
