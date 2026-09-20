/* Serve only the built game on this Mac's LAN. No repository directory listing. */
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const root=path.resolve(__dirname,'../dist');
const port=Number(process.env.RACE_TEST_PORT||4177);
if(!fs.existsSync(path.join(root,'index.html')))throw Error('Run npm run build first');
const mime={'.webmanifest':'application/manifest+json','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.txt':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
 const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.stat(target,(err,stat)=>{
  if(err||!stat.isFile()){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(target).pipe(res);
 });
}).listen(port,'0.0.0.0',()=>{
 console.log('Local two-player test. Keep this Mac awake; phones need the same Wi-Fi.');
 console.log('http://127.0.0.1:'+port+'/');
 for(const addresses of Object.values(os.networkInterfaces()))for(const a of addresses)if(a.family==='IPv4'&&!a.internal)console.log('http://'+a.address+':'+port+'/');
});
