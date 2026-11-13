/**
 * Vault — Persistent LinkedIn Endpoint Storage Layer
 * Thread-safe atomic JSON storage for LinkedIn Voyager / SDUI endpoint registry.
 */

const fs = require('fs');
const path = require('path');

const STORAGE_FILE = path.join(__dirname, 'endpoints.json');

const DEFAULT_REGISTRY = {
  updatedAt: Date.now(),
  auditRequestedAt: null,
  endpoints: {
    sendInvite: {
      name: 'Send Connection Invite',
      url: '/voyager/api/voyagerRelationshipsDashMemberRelationships?action=verifyQuotaAndCreateV2&decorationId=com.linkedin.voyager.dash.deco.relationships.InvitationCreationResultWithInvitee-2',
      method: 'POST',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        pageUrl: 'https://www.linkedin.com/in/{profile}',
        networkFilter: 'method:POST',
        action: 'Click "Connect" -> "Send without note" on any member profile',
        copyTarget: 'Request URL (voyagerRelationshipsDashMemberRelationships with action & decorationId)',
      },
    },
    withdrawInvitation: {
      name: 'Withdraw Invitation',
      url: '/flagship-web/rsc-action/actions/server-request?sduiid=com.linkedin.sdui.requests.mynetwork.addaWithdrawInvitation',
      method: 'POST',
      sduiid: 'com.linkedin.sdui.requests.mynetwork.addaWithdrawInvitation',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        pageUrl: 'https://www.linkedin.com/mynetwork/invitation-manager/sent/',
        networkFilter: 'method:POST',
        action: 'Click "Withdraw" on any pending sent invitation',
        copyTarget: 'rsc-action URL and sduiid query parameter',
      },
    },
    listSentInvitations: {
      name: 'List Sent Invitations',
      url: '/voyager/api/relationships/sentInvitationViewsV2?count=100&invitationType=CONNECTION&q=invitationType&start=0',
      method: 'GET',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        pageUrl: 'https://www.linkedin.com/mynetwork/invitation-manager/sent/',
        networkFilter: 'sentInvitation',
        action: 'Open or refresh the "Sent Invitations" tab',
        copyTarget: 'Full GET URL with query params (count, invitationType, q, start)',
      },
    },
    connectionsSummary: {
      name: 'Connections Summary',
      url: '/voyager/api/relationships/connectionsSummary',
      method: 'GET',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        pageUrl: 'https://www.linkedin.com/mynetwork/invite-connect/connections/',
        networkFilter: 'connections',
        action: 'Open the "Connections" tab under My Network',
        copyTarget: 'Request URL (/voyager/api/relationships/connectionsSummary)',
      },
    },
    messengerConversations: {
      name: 'Messenger Conversations',
      url: '/voyager/api/voyagerMessagingGraphQL/graphql?queryId=messengerConversations.9501074288a12f3ae9e3c7ea243bccbf',
      method: 'GET',
      queryId: 'messengerConversations.9501074288a12f3ae9e3c7ea243bccbf',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        pageUrl: 'https://www.linkedin.com/messaging/',
        networkFilter: 'graphql',
        action: 'Open Messaging inbox or click any conversation thread',
        copyTarget: 'queryId parameter in the GraphQL query URL',
      },
    },
    profileView: {
      name: 'Profile View (Dash)',
      url: '/voyager/api/identity/dash/profiles',
      method: 'GET',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        pageUrl: 'https://www.linkedin.com/in/{profile}',
        networkFilter: 'profiles',
        action: 'Navigate to any member profile page',
        copyTarget: 'Base URL path (/voyager/api/identity/dash/profiles)',
      },
    },
  },
};

function readEndpoints() {
  try {
    if (!fs.existsSync(STORAGE_FILE)) {
      writeEndpoints(DEFAULT_REGISTRY);
      return JSON.parse(JSON.stringify(DEFAULT_REGISTRY));
    }
    const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.endpoints) parsed.endpoints = {};

    // Ensure all default seeds exist and network filters are future-proof
    let needsSave = false;
    for (const [key, defaultVal] of Object.entries(DEFAULT_REGISTRY.endpoints)) {
      if (!parsed.endpoints[key]) {
        parsed.endpoints[key] = { ...defaultVal };
        needsSave = true;
      } else if (defaultVal.captureGuide?.networkFilter) {
        if (!parsed.endpoints[key].captureGuide) {
          parsed.endpoints[key].captureGuide = { ...defaultVal.captureGuide };
          needsSave = true;
        } else if (parsed.endpoints[key].captureGuide.networkFilter !== defaultVal.captureGuide.networkFilter) {
          parsed.endpoints[key].captureGuide.networkFilter = defaultVal.captureGuide.networkFilter;
          needsSave = true;
        }
      }
    }
    if (needsSave) {
      writeEndpoints(parsed);
    }
    return parsed;
  } catch (err) {
    console.error('[Endpoint Storage] Read error:', err.message);
    return JSON.parse(JSON.stringify(DEFAULT_REGISTRY));
  }
}

function writeEndpoints(data) {
  try {
    const tmpFile = `${STORAGE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, STORAGE_FILE);
  } catch (err) {
    console.error('[Endpoint Storage] Atomic write error:', err.message);
  }
}

module.exports = {
  readEndpoints,
  writeEndpoints,
  DEFAULT_REGISTRY,
};

