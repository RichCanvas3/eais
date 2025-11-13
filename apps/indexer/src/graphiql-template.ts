/**
 * Shared GraphiQL HTML template for both Express (local) and Workers (production)
 */

export const graphiqlHTML = `<!DOCTYPE html>
<html>
  <head>
    <title>GraphiQL - ERC8004 Indexer</title>
    <link rel="stylesheet" href="https://unpkg.com/graphiql@3/graphiql.min.css" />
    <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/graphiql@3/graphiql.min.js"></script>
  </head>
  <body style="margin: 0;">
    <div id="graphiql" style="height: 100vh;"></div>
    <script>
      // Read access code from URL parameters (query string or hash) and set it for GraphiQL
      let accessCode = null;
      let defaultHeadersValue = JSON.stringify({
        "Authorization": "Bearer YOUR_ACCESS_CODE_HERE"
      }, null, 2);
      
      (function() {
        // First, try to read from URL query parameters
        const urlParams = new URLSearchParams(window.location.search);
        accessCode = urlParams.get('accessCode');
        
        // If not found in query params, try hash (for backward compatibility)
        if (!accessCode) {
          const hash = window.location.hash;
          if (hash) {
            const match = hash.match(/accessCode=([^&]+)/);
            if (match) {
              accessCode = decodeURIComponent(match[1]);
            }
          }
        }
        
        if (accessCode) {
          const headersObj = { Authorization: \`Bearer \${accessCode}\` };
          const headersJson = JSON.stringify(headersObj, null, 2);
          
          // Set the defaultHeadersValue to use in GraphiQL initialization
          defaultHeadersValue = headersJson;
          
          // Store in localStorage keys that GraphiQL checks
          const possibleKeys = [
            'graphiql:headers',
            'graphiql-headers',
            'graphiql.headers',
            'graphiql-headers-v3',
            'graphiql@3:headers'
          ];
          
          possibleKeys.forEach(key => {
            try {
              localStorage.setItem(key, headersJson);
              console.log('✅ Set access code in localStorage key:', key);
            } catch (e) {
              console.warn('Failed to set localStorage key ' + key + ':', e);
            }
          });
          
          // Also set a global variable for the fetcher to use
          window.graphiqlHeaders = headersObj;
          console.log('✅ Set access code from URL parameters:', accessCode.substring(0, 10) + '...');
          
          // Clean up the parameters from URL (optional, for cleaner URL)
          const cleanUrl = window.location.pathname;
          window.history.replaceState(null, '', cleanUrl);
        }
      })();
      
      const graphQLFetcher = async (graphQLParams) => {
        // Get Authorization header from multiple sources
        let headers = { 'Content-Type': 'application/json' };
        
        try {
          // Method 1: Check global store
          if (window.graphiqlHeaders && Object.keys(window.graphiqlHeaders).length > 0) {
            Object.assign(headers, window.graphiqlHeaders);
          }
          
          // Method 2: Check localStorage
          const savedHeaders = localStorage.getItem('graphiql:headers') || localStorage.getItem('graphiql-headers');
          if (savedHeaders) {
            const parsed = JSON.parse(savedHeaders);
            if (parsed.Authorization) {
              headers['Authorization'] = parsed.Authorization;
            }
          }
          
          // Method 3: Try to read from header editor DOM element
          const headerSelectors = [
            'textarea[aria-label*="header" i]',
            '.graphiql-headers-editor textarea',
            '.graphiql-editor[aria-label*="header" i]'
          ];
          
          for (const selector of headerSelectors) {
            const headerEditor = document.querySelector(selector);
            if (headerEditor && headerEditor.value && headerEditor.value.trim()) {
              try {
                const parsed = JSON.parse(headerEditor.value.trim());
                if (parsed.Authorization) {
                  headers['Authorization'] = parsed.Authorization;
                  break;
                }
              } catch (e) {
                // Not valid JSON, continue
              }
            }
          }
        } catch (e) {
          console.error('Error extracting headers:', e);
        }
        
        return fetch('/graphql', {
          method: 'post',
          headers: headers,
          body: JSON.stringify(graphQLParams),
        }).then(response => response.json());
      };
      
      // Set default query value
      const defaultQueryValue = \`query {
  agents(limit: 5, offset: 0, orderBy: "createdAtTime", orderDirection: "DESC") {
    chainId
    agentId
    agentAccount
    agentName
    agentOwner
    didIdentity
    didAccount
    didName
    metadataURI
    description
    image
    type
    a2aEndpoint
    ensEndpoint
    agentAccountEndpoint
    supportedTrust
    did
    mcp
    x402support
    active
    createdAtBlock
    createdAtTime
    updatedAtTime
    rawJson
  }
}\`;
      
      ReactDOM.render(
        React.createElement(GraphiQL, { 
          fetcher: graphQLFetcher,
          query: defaultQueryValue,
          defaultQuery: defaultQueryValue,
          headerEditorEnabled: true,
          shouldPersistHeaders: true,
          defaultHeaders: defaultHeadersValue
        }),
        document.getElementById('graphiql')
      );
      
      // After GraphiQL renders, programmatically set the query editor value
      setTimeout(() => {
        const querySelectors = [
          'textarea[aria-label*="query" i]',
          '.graphiql-query-editor textarea',
          '.graphiql-editor[aria-label*="query" i]',
          '.graphiql-editor:first-of-type textarea',
          '#graphiql-query',
          '.graphiql-editor textarea'
        ];
        
        for (const selector of querySelectors) {
          const queryEditor = document.querySelector(selector);
          if (queryEditor && queryEditor.tagName === 'TEXTAREA' && (!queryEditor.value || queryEditor.value.trim() === '')) {
            queryEditor.value = defaultQueryValue;
            ['input', 'change'].forEach(eventType => {
              const event = new Event(eventType, { bubbles: true });
              queryEditor.dispatchEvent(event);
            });
            console.log('✅ Set query editor value:', selector);
            break;
          }
        }
      }, 200);
      
      // After GraphiQL renders, programmatically set the header editor value if we have an access code
      if (accessCode) {
        const headersJson = JSON.stringify({ Authorization: \`Bearer \${accessCode}\` }, null, 2);
        const headerSelectors = [
          'textarea[aria-label*="header" i]',
          'textarea[placeholder*="header" i]',
          '.graphiql-headers-editor textarea',
          '.graphiql-editor[aria-label*="header" i]',
          '[data-name="headers"]',
          '#graphiql-headers'
        ];
        
        // Try multiple times with increasing delays to catch GraphiQL after it renders
        const attempts = [100, 300, 500, 1000];
        attempts.forEach((delay, idx) => {
          setTimeout(() => {
            for (const selector of headerSelectors) {
              const headerEditor = document.querySelector(selector);
              if (headerEditor && headerEditor.tagName === 'TEXTAREA') {
                headerEditor.value = headersJson;
                // Trigger multiple events to ensure GraphiQL picks it up
                ['input', 'change', 'blur'].forEach(eventType => {
                  const event = new Event(eventType, { bubbles: true });
                  headerEditor.dispatchEvent(event);
                });
                console.log('✅ Set header editor value via DOM (attempt ' + (idx + 1) + '):', selector);
                return;
              }
            }
          }, delay);
        });
        
        // Also use MutationObserver to catch it when it appears
        const observer = new MutationObserver(() => {
          for (const selector of headerSelectors) {
            const headerEditor = document.querySelector(selector);
            if (headerEditor && headerEditor.tagName === 'TEXTAREA' && headerEditor.value !== headersJson) {
              headerEditor.value = headersJson;
              ['input', 'change', 'blur'].forEach(eventType => {
                const event = new Event(eventType, { bubbles: true });
                headerEditor.dispatchEvent(event);
              });
              console.log('✅ Set header editor value via MutationObserver:', selector);
              observer.disconnect();
              return;
            }
          }
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
        
        // Disconnect observer after 5 seconds
        setTimeout(() => observer.disconnect(), 5000);
      }
    </script>
  </body>
</html>`;

