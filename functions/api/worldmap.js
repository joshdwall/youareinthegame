import {worldmapData,excludeWorldmapBrowser} from '../_shared/worldmap.js';
import {worldmapHistory} from '../_shared/worldmap-history.js';
export const onRequestGet=context=>new URL(context.request.url).searchParams.get('source')==='cloudflare'?worldmapHistory(context):worldmapData(context);
export const onRequestPost=excludeWorldmapBrowser;
