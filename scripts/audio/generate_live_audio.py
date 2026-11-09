"""Generate EVALORA's original, percussion-free live quiz sound library.
All compositions are algorithmically generated for EVALORA; no sampled third-party material.
PCM WAV, 22.05 kHz, stereo, normalized to a -1 dBFS peak ceiling.
"""
import math, wave, struct, os
from array import array

OUT='public/audio/live'
SR=22050
TAU=2*math.pi

def env(t, dur, attack=.035, release=.18):
    return min(1.0, t/max(attack,1e-5), max(0.0,(dur-t)/max(release,1e-5)))

def voice(freq, t, dur, amp=0.15, kind='soft', pan=0.0):
    if t < 0 or t >= dur: return (0.0,0.0)
    e=env(t,dur, .055 if kind in ('pad','soft') else .012, min(.32,dur*.42))
    if kind=='pad':
        # warm, smooth, lightly chorused harmonic stack
        x=(math.sin(TAU*freq*t)+.27*math.sin(TAU*freq*2*t+.2)+.09*math.sin(TAU*freq*3*t+.6))/1.36
        x=.72*x+.28*math.sin(TAU*(freq*1.003)*t)
    elif kind=='bell':
        x=.72*math.sin(TAU*freq*t)+.21*math.sin(TAU*freq*2.01*t)+.07*math.sin(TAU*freq*3.98*t)
        e *= math.exp(-t*1.4)
    elif kind=='pluck':
        x=.82*math.sin(TAU*freq*t)+.18*math.sin(TAU*freq*2*t+.1)
        e *= math.exp(-t*1.0)
    else:
        x=.9*math.sin(TAU*freq*t)+.1*math.sin(TAU*freq*2*t)
    amp *= e
    return x*amp*math.sqrt((1-pan)*.5), x*amp*math.sqrt((1+pan)*.5)

def render(name, duration, events, bed=None, target_peak=.86, loop=False):
    n=round(duration*SR)
    left=array('f',[0.0])*n; right=array('f',[0.0])*n
    # Continuous, soft pad keeps music full on small speakers without percussion.
    if bed:
        for f,a in bed:
            for i in range(n):
                l,r=voice(f,i/SR,duration,a,'pad',-.08 if f<400 else .08)
                left[i]+=l; right[i]+=r
    for start,f,dur,amp,kind,pan in events:
        i0=max(0,int(start*SR)); i1=min(n,int((start+dur)*SR))
        for i in range(i0,i1):
            l,r=voice(f,i/SR-start,dur,amp,kind,pan)
            left[i]+=l; right[i]+=r
    # Short, symmetric edge fades keep the cyclic boundary click-free.
    # Notes and harmony continue throughout the loop; this is only a tiny edge guard.
    if loop:
        fade=min(round(.035*SR), n//8)
        for i in range(fade):
            w=(i+1)/(fade+1)
            for ch in (left,right):
                ch[i] *= w
                ch[n-fade+i] *= 1-w
    peak=max(max(abs(x) for x in left),max(abs(x) for x in right),1e-9)
    gain=min(target_peak/peak, 8.0)
    os.makedirs(OUT,exist_ok=True)
    with wave.open(os.path.join(OUT,name+'.wav'),'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        data=bytearray()
        for l,r in zip(left,right):
            data += struct.pack('<hh', max(-32767,min(32767,round(l*gain*32767))), max(-32767,min(32767,round(r*gain*32767))))
        w.writeframes(data)

# Frequencies are original E-major / C#-minor colors with bright, rounded synth tones.
# Lobby: gently propulsive, interlocking plucked melody over lush sustained harmony.
lobby_notes=[659.25, 783.99, 987.77, 783.99, 659.25, 587.33, 739.99, 880.00,
             659.25, 783.99, 987.77, 1174.66, 987.77, 880.00, 783.99, 659.25]
events=[]
for i,f in enumerate(lobby_notes): events.append((i*.48,f,.72,.105,'pluck',(-.35 if i%2==0 else .35)))
render('lobby-loop',7.68,events,[(164.81,.10),(207.65,.08),(246.94,.055),(329.63,.035)],loop=True)
# Question bed: a calm but still playful harmonic loop, no rhythmic percussion.
notes=[493.88,587.33,659.25,783.99,659.25,587.33,440,523.25,659.25,783.99,880,783.99]
events=[(i*.5,f,.74,.065,'soft',(-.25 if i%2 else .25)) for i,f in enumerate(notes)]
render('question-loop',6.0,events,[(146.83,.075),(220,.055),(293.66,.04),(369.99,.025)],loop=True)
# A musical identifier for entering a live game.
render('game-start',2.65,[(0,493.88,.65,.15,'bell',-.2),(.24,659.25,.72,.14,'bell',.15),(.52,783.99,.78,.15,'bell',-.1),(.88,987.77,1.55,.17,'bell',.12),(1.03,659.25,1.25,.07,'pad',-.1)],[(246.94,.08),(329.63,.06),(493.88,.04)])
render('question-transition',1.55,[(0,659.25,.42,.12,'pluck',-.25),(.13,783.99,.46,.13,'pluck',.2),(.3,987.77,.82,.15,'bell',0),(.47,1318.51,.78,.075,'bell',.18)],[(329.63,.06),(493.88,.035)])
# A ten-second rising harmonic motif for the final countdown; only sustained/plucked pitches, no percussion.
countdown=[]
for i,f in enumerate([329.63,369.99,415.30,493.88,554.37,659.25,739.99,830.61,987.77,1174.66]):
    countdown.append((i*.88,f,1.25,.10+i*.003,'pluck',(-.22 if i%2==0 else .22)))
for i,f in enumerate([164.81,196.00,220.00,246.94,293.66]):
    countdown.append((5+i*.9,f,3.8,.045,'pad',.0))
render('countdown-suspense',10.0,countdown,[(246.94,.045),(329.63,.035)],target_peak=.82)
# Time-up has a descending, rounded melodic cadence, not an alarm/buzzer.
render('time-up',1.35,[(0,783.99,.48,.14,'bell',-.2),(.22,659.25,.56,.14,'bell',.15),(.48,523.25,.76,.16,'soft',0)],[(261.63,.05),(392,.03)])
render('answer-reveal',1.75,[(0,493.88,.48,.11,'soft',-.25),(.28,587.33,.5,.12,'soft',.2),(.59,659.25,.72,.15,'bell',-.1),(.92,783.99,.68,.13,'bell',.15)],[(246.94,.06),(369.99,.04)])
render('answer-submitted',.72,[(0,659.25,.29,.12,'pluck',-.16),(.12,783.99,.46,.13,'bell',.16)],[(329.63,.035)])
render('answer-correct',1.35,[(0,659.25,.48,.16,'bell',-.3),(.12,783.99,.48,.15,'bell',.22),(.32,987.77,.82,.17,'bell',-.12),(.52,1318.51,.65,.11,'bell',.2)],[(329.63,.06),(493.88,.04)])
render('answer-try-again',1.2,[(0,587.33,.44,.14,'pluck',-.2),(.2,493.88,.55,.14,'soft',.15),(.48,523.25,.62,.13,'bell',0)],[(246.94,.06),(392,.03)])
render('leaderboard',2.25,[(0,523.25,.58,.14,'bell',-.28),(.2,659.25,.58,.14,'bell',.25),(.46,783.99,.84,.16,'bell',-.12),(.84,987.77,1.1,.15,'bell',.18),(1.05,659.25,.94,.07,'pad',-.1)],[(261.63,.08),(392,.045),(523.25,.025)])
render('rank-shift',.8,[(0,659.25,.34,.11,'pluck',-.18),(.11,783.99,.45,.12,'bell',.16)],[(329.63,.035)])
render('podium-victory',4.8,[(0,523.25,.65,.15,'bell',-.25),(.25,659.25,.65,.15,'bell',.25),(.55,783.99,.7,.16,'bell',-.18),(.88,987.77,1.35,.17,'bell',.15),(1.18,783.99,.9,.11,'pad',-.2),(1.42,1174.66,1.35,.16,'bell',.18),(1.78,1318.51,2.5,.15,'bell',0),(2.0,659.25,2.3,.08,'pad',-.1)],[(261.63,.07),(329.63,.06),(392,.045),(523.25,.035)])
render('game-complete',2.8,[(0,783.99,.62,.14,'bell',-.2),(.23,659.25,.64,.13,'bell',.2),(.58,587.33,.72,.13,'soft',-.1),(.93,659.25,1.52,.16,'bell',.1),(1.08,493.88,1.4,.07,'pad',-.1)],[(246.94,.07),(329.63,.05)])
