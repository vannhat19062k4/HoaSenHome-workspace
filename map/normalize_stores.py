import json, re, unicodedata, urllib.parse, collections, sys
from pathlib import Path
import openpyxl

if len(sys.argv) != 2:
    raise SystemExit('Cách dùng: python3 normalize_stores.py "Danh sách vị trí cửa hàng.xlsx"')
SOURCE=Path(sys.argv[1])
OUT=Path(__file__).parent
OUT.mkdir(parents=True,exist_ok=True)

def clean(x):
    return ' '.join(str(x).split()) if x is not None else ''

def norm(x):
    x=unicodedata.normalize('NFD',clean(x).casefold())
    return ''.join(c for c in x if unicodedata.category(c)!='Mn').replace('đ','d')

PROVINCE_ALIASES={
    'Quảng Bình':'Quảng Trị', 'Hải Dương':'Hải Phòng',
    'Long An':'Tây Ninh', 'Bình Phước':'Đồng Nai',
}

def province(address):
    a=clean(address)
    matches=re.findall(r'(?:Tỉnh|tỉnh|Thành phố|thành phố|TP\.?)[ ]+([^,\.]+)',a)
    if matches:
        v=matches[-1].strip()
    else:
        chunks=[s.strip(' .') for s in a.split(',')]
        v=chunks[-2] if len(chunks)>1 else ''
    if v in ('Hồ Chí Minh','TP HCM','TP.HCM'): v='Hồ Chí Minh'
    return PROVINCE_ALIASES.get(v,v), v

DMS=re.compile(r'(\d{1,3})°\s*(\d{1,2})\'\s*([\d.]+)"?\s*([NS])[^\d]+(\d{1,3})°\s*(\d{1,2})\'\s*([\d.]+)"?\s*([EW])',re.I)
DEC=re.compile(r'(-?\d{1,2}\.\d{3,}),\s*(-?\d{2,3}\.\d{3,})')

def coords(raw):
    u=urllib.parse.unquote(clean(raw)).replace('+',' ')
    m=DMS.search(u)
    if m:
        lat=int(m[1])+int(m[2])/60+float(m[3])/3600
        lon=int(m[5])+int(m[6])/60+float(m[7])/3600
        if m[4].upper()=='S': lat=-lat
        if m[8].upper()=='W': lon=-lon
        source='google_maps_dms'
    else:
        pairs=DEC.findall(u)
        if not pairs: return None,None,'unresolved_short_link' if u.startswith('http') else 'unresolved_text'
        if '/maps/dir/' in u and len(pairs)>=2:
            lat,lon=map(float,pairs[1]); source='google_maps_route_destination'
        elif 'q=' in u:
            lat,lon=map(float,pairs[0]); source='google_maps_query'
        elif 'll=' in u:
            m2=re.search(r'[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)',u)
            lat,lon=map(float,m2.groups()) if m2 else map(float,pairs[0]); source='google_maps_view'
        else:
            lat,lon=map(float,pairs[0]); source='google_maps_view'
    if not (8<=lat<=24 and 102<=lon<=115): return None,None,'outside_vietnam_check'
    return round(lat,6),round(lon,6),source

wb=openpyxl.load_workbook(SOURCE,data_only=True)
result=[]
for sheet,type_id in [(wb.worksheets[0],'traditional'),(wb.worksheets[1],'home')]:
    region=''
    for row in sheet.iter_rows(min_row=5,max_col=17):
        v=[c.value for c in row]
        c=clean(v[2])
        if norm(c) in ('mien bac','mien trung','mien nam'):
            region={'mien bac':'Bắc','mien trung':'Trung','mien nam':'Nam'}[norm(c)]
        code=clean(v[3])
        if not code or not (clean(v[5]) or clean(v[6])): continue
        address=clean(v[15]); prov,raw_prov=province(address)
        lat,lon,coord_source=coords(v[16])
        # This URL supplies a map viewport center outside Đắk Lắk, not the store location.
        if type_id=='home' and code=='E46' and coord_source=='google_maps_view':
            lat,lon,coord_source=None,None,'map_view_outside_province'
        maps=clean(v[16]); maps=maps if maps.startswith(('https://','http://')) else ''
        if not maps and lat is not None: maps=f'https://www.google.com/maps?q={lat},{lon}'
        result.append({
            'id':f'{type_id}:{code}', 'code':code, 'type':type_id,
            'name':clean(v[6]) or clean(v[5]), 'groupName':clean(v[5]),
            'model':clean(v[4]), 'region':region, 'province':prov,
            'sourceProvince':raw_prov, 'managementGroup':c,
            'address':address, 'lat':lat, 'lng':lon,
            'coordinateSource':coord_source, 'mapsUrl':maps,
            'companyEmail':clean(v[14]) or clean(v[13]),
            'sourceSheet':sheet.title, 'sourceRow':row[0].row,
        })

Path(OUT/'data').mkdir(exist_ok=True)
(OUT/'data'/'stores.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'data'/'stores.js').write_text('window.HOA_SEN_STORES = '+json.dumps(result,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
summary={
    'total':len(result), 'types':dict(collections.Counter(x['type'] for x in result)),
    'regions':dict(collections.Counter(x['region'] for x in result)),
    'provinces':dict(collections.Counter(x['province'] for x in result)),
    'coordinateSources':dict(collections.Counter(x['coordinateSource'] for x in result)),
    'unlocated':[{'code':x['code'],'name':x['name'],'province':x['province'],'sourceRow':x['sourceRow'],'sourceSheet':x['sourceSheet'],'mapsUrl':x['mapsUrl']} for x in result if x['lat'] is None],
    'unclassified':[{'code':x['code'],'region':x['region'],'province':x['province']} for x in result if not x['region'] or not x['province']],
    'oldProvinceAliases':[{'code':x['code'],'sourceProvince':x['sourceProvince'],'province':x['province']} for x in result if x['sourceProvince']!=x['province']],
}
(OUT/'data'/'audit.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
