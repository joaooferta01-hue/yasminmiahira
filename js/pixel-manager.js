// js/pixel-manager.js - VERSÃO FINAL CORRIGIDA E OTIMIZADA (GTM-FIRST)

(function(window, document) {
    'use strict';

    function generateUUID() { return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)); }
    function getCookie(name) { const v=`; ${document.cookie}`;const p=v.split(`; ${name}=`);if(p.length===2)return p.pop().split(';').shift();return null; }
    function getUrlParam(name) { return new URLSearchParams(window.location.search).get(name); }

    let PIXEL_CONFIG = {};
    let isInitialized = false;
    let sessionData = {}; 
    const eventQueue = [];
    
    const staticSessionData = {
        user_agent: navigator.userAgent,
        fbc: getCookie('_fbc'),
        fbp: getCookie('_fbp'),
        gclid: getUrlParam('gclid'),
        ttclid: getUrlParam('ttclid'),
    };

    function manageEventId() {
        let eventId = getUrlParam('event_id') || getCookie('user_event_id');
        if (!eventId) { eventId = generateUUID(); }
        document.cookie = `user_event_id=${eventId};path=/;max-age=7200;SameSite=Lax`; // 2 horas de cookie
        staticSessionData.event_id = eventId;
    }

    function processQueue() {
        while (eventQueue.length > 0) {
            const item = eventQueue.shift();
            fireEvent(item.eventName, item.eventData);
        }
    }

    // A ÚNICA FUNÇÃO DE DISPARO. ELA FAZ TUDO. (VERSÃO OTIMIZADA)
    function fireEvent(eventName, eventData = {}) {
        if (!isInitialized) {
            eventQueue.push({ eventName, eventData });
            return;
        }

        const { productData, customerData = {} } = eventData;

        // 1. LÓGICA PRINCIPAL: ENVIAR PARA O GTM DATALAYER COM ESTRUTURA OTIMIZADA
        if (window.dataLayer) {
            const gtmEventMap = { 'ViewContent': 'view_item', 'AddToCart': 'add_to_cart', 'InitiateCheckout': 'begin_checkout', 'Purchase': 'purchase' };
            const gtmEventName = gtmEventMap[eventName] || eventName.toLowerCase();

            // Estrutura alinhada com as melhores práticas do Google (User-Provided Data)
            const userDataForGTM = {
                email: customerData.em,
                phone_number: customerData.ph,
                address: {
                    first_name: customerData.fn,
                    last_name: customerData.ln,
                    city: sessionData.ct,
                    region: sessionData.st,
                    postal_code: sessionData.zp,
                    country: sessionData.country
                }
            };
            
            // Limpa chaves vazias ou nulas do objeto de usuário para manter a dataLayer limpa
            Object.keys(userDataForGTM).forEach(key => (userDataForGTM[key] === undefined || userDataForGTM[key] === null) && delete userDataForGTM[key]);
            if (userDataForGTM.address) {
                Object.keys(userDataForGTM.address).forEach(key => (userDataForGTM.address[key] === undefined || userDataForGTM.address[key] === null) && delete userDataForGTM.address[key]);
                if (Object.keys(userDataForGTM.address).length === 0) delete userDataForGTM.address;
            }

            const gtmData = {
                event: gtmEventName,
                event_id: staticSessionData.event_id,
                // Parâmetros de sessão no nível raiz para fácil acesso no GTM
                client_ip_address: sessionData.ip_address,
                client_user_agent: staticSessionData.user_agent,
                ecommerce: { ...productData },
                // 'user_data' é o objeto padrão do Google para Enhanced Conversions
                user_data: userDataForGTM
            };
            
            if (eventName === 'Purchase' && eventData.transaction_id) {
                gtmData.ecommerce.transaction_id = eventData.transaction_id;
            }

            // Melhor prática: limpa o ecommerce anterior antes de enviar um novo evento
            window.dataLayer.push({ ecommerce: null }); 
            window.dataLayer.push(gtmData);
            
            console.log(`[PixelManager] Evento GTM '${gtmEventName}' enviado:`, gtmData);
        }

        // 2. LÓGICA SECUNDÁRIA (OPCIONAL): ENVIAR PARA PLATAFORMAS NATIVAS
        if (typeof fbq === 'function' && PIXEL_CONFIG.FACEBOOK_PIXEL_ID) {
            // Nota: o Meta Pixel usa o mesmo eventID para deduplicação com a API de Conversões
            fbq('track', eventName, productData, { eventID: staticSessionData.event_id });
        }
    }

    // EXPOMOS APENAS a função 'fire'. Não há mais 'identify'.
    window.PixelManager = {
        fire: fireEvent,
        getEventId: () => staticSessionData.event_id,
    };

    function initialize() {
        manageEventId();
        fetch('/track/get-pixel-config')
            .then(response => response.json())
            .then(config => {
                PIXEL_CONFIG = config.pixelIds || {};
                const initialGeoData = config.geoData || {};

                // Popula o objeto de sessão com os dados iniciais (IP e GeoIP)
                sessionData = {
                    ip_address: initialGeoData.ip,
                    ct: initialGeoData.city,
                    st: initialGeoData.region,
                    zp: initialGeoData.postalCode,
                    country: initialGeoData.country,
                };
                
                isInitialized = true;
                console.log('[PixelManager] Inicializado com dados de sessão:', sessionData);
                processQueue();
            })
            .catch(error => {
                console.error('[PixelManager] Erro fatal ao carregar config. Operando em modo offline.', error);
                // Mesmo com erro, inicializa para processar a fila com os dados que já temos.
                isInitialized = true; 
                processQueue();
            });
    }

    initialize();

})(window, document);