"""One unprivileged, bounded parser process; no decoder or executable uploads."""
import json,os,sys,math
if os.name=='posix':
    import resource
    resource.setrlimit(resource.RLIMIT_AS,(128*1024*1024,128*1024*1024))
    resource.setrlimit(resource.RLIMIT_CPU,(8,8))
import mutagen

def main():
    from .assets import FORMATS
    try:
        with open(sys.argv[1],'rb') as source:header=source.read(12)
        expected=('MP3' if header.startswith(b'ID3') or len(header)>1 and header[0]==255 and header[1]&224==224 else
                  'WAVE' if header.startswith(b'RIFF') and header[8:12]==b'WAVE' else
                  'FLAC' if header.startswith(b'fLaC') else 'Ogg' if header.startswith(b'OggS') else
                  'MP4' if header[4:8]==b'ftyp' else None)
        if expected is None:raise ValueError()
        value=mutagen.File(sys.argv[1])
        if value is None or value.__class__.__name__ not in FORMATS or not (math.isfinite(float(value.info.length)) and float(value.info.length)>0):raise ValueError()
        if not value.__class__.__name__.startswith(expected):raise ValueError()
        extension,mime=FORMATS[value.__class__.__name__]
        print(json.dumps([extension,mime,float(value.info.length)]))
    except BaseException:raise SystemExit(1)
if __name__=='__main__':main()
