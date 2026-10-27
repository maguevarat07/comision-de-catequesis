/* Interacciones del prototipo. No se envían ni guardan datos. */
window.createCatequesisComponent = function (DCLogic) {
class Component extends DCLogic {
  state = { zone: -1, hito: 0, rev: 0, open: -1, step: 0, sub: 0, ag: -1, interes: 0, categorias: [], nombre: '', parroquia: '', contacto: '', mensaje: '', sent: false };

  renderVals() {
    const s = this.state;
    const gold = this.props.accent ?? '#F0B544';

    const stepsData = [
      { title: 'Acércate a tu parroquia', body: 'El primer paso para servir como catequista es conversar con tu comunidad parroquial. Allí podrás conocer sus necesidades y recibir orientación para comenzar.', offer: 'La Comisión acompaña a los equipos parroquiales y a las zonas pastorales.', cta: 'Pedir orientación' },
      { title: 'Fórmate', body: 'CENAFCA ofrece formación bíblica, teológica, catequética, pedagógica y pastoral. La preparación del catequista es un proceso continuo, unido a la oración y la vida comunitaria.', offer: 'Formación humana, espiritual, doctrinal, pedagógica y metodológica.', cta: 'Conocer CENAFCA' },
      { title: 'Comparte la fe', body: 'La catequesis ayuda a niños, jóvenes y adultos a conocer a Jesucristo y a vivir el Evangelio. Cada comunidad adapta su acompañamiento a las personas y a su realidad.', offer: 'Lineamientos, materiales y apoyo para la labor catequética.', cta: 'Conocer los servicios' },
      { title: 'Camina en comunidad', body: 'La Comisión promueve encuentros, retiros y espacios de coordinación para fortalecer la vocación del catequista y la comunión entre parroquias.', offer: 'Encuentros zonales, Semana de Catequesis y Día del Catequista.', cta: 'Ver actividades' }
    ];
    const steps = stepsData.map((d, i) => {
      const active = s.step === i; const done = s.step >= i;
      return {
        n: i + 1, title: d.title, body: d.body, offer: d.offer, cta: d.cta, href: ['#unete', '#cenafca', '#servicios', '#agenda'][i], active,
        pick: () => this.setState({ step: i }),
        btnStyle: 'background:none;border:0;cursor:pointer;color:#F2F5FB;font:inherit;display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:0 4px 0 0;min-height:44px;opacity:' + (active ? 1 : 0.72),
        dotStyle: 'width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px;font-family:Fraunces,Georgia,serif;transition:all .4s;border:3px solid ' + gold + ';background:' + (done ? gold : '#0E1B3D') + ';color:' + (done ? '#0E1B3D' : gold) + ';transform:scale(' + (active ? 1.12 : 1) + ')'
      };
    });
    const progress = 'calc((100% - 56px) * ' + (s.step / 3) + ')';

    const svcData = [
      ['Orientación pastoral', 'Unificamos criterios y ofrecemos lineamientos para los procesos catequéticos en las parroquias.', 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5'],
      ['Formación permanente', 'Fortalecemos la preparación doctrinal, pedagógica, humana y espiritual de los catequistas.', 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.9M16 4.2a3.5 3.5 0 0 1 0 6.6'],
      ['Acompañamiento', 'Escuchamos y apoyamos a las zonas pastorales, sus representantes y los equipos parroquiales.', 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1'],
      ['Materiales y recursos', 'Diseñamos subsidios y recursos para apoyar la educación en la fe y la vida pastoral.', 'M22 2 11 13M22 2l-7 20-4-9-9-4z'],
      ['Encuentros y jornadas', 'Coordinamos eventos, semanas catequéticas y espacios de encuentro entre comunidades.', 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
      ['Catequesis para todos', 'Promovemos procesos de fe para diversas edades y para personas con necesidades especiales.', 'M11 20A7 7 0 0 1 4 13c0-6 6-10 16-10 0 10-4 17-9 17zM4 21c3-6 6-9 11-12']
    ];
    const services = svcData.map(d => ({ title: d[0], text: d[1], icon: d[2], style: 'background:#fff;border:1px solid #D6DDEC;border-radius:22px;padding:32px' }));

    const subData = [
      ['Familiar', 'La Comisión promueve procesos que integran a la familia, la comunidad y la liturgia en la iniciación cristiana.'],
      ['Especial', 'La educación en la fe incluye la catequesis para personas con necesidades especiales, atendiendo a sus realidades.'],
      ['De adultos', 'La formación en la fe acompaña también a quienes profundizan su vida cristiana en la edad adulta.'],
      ['De jóvenes', 'La catequesis acompaña a los jóvenes en el conocimiento de Cristo y la vivencia de su Evangelio.']
    ];
    const subs = subData.map((d, i) => ({
      label: d[0], active: s.sub === i,
      pick: () => this.setState({ sub: i }),
      style: 'padding:12px 24px;border-radius:99px;font:inherit;font-weight:700;cursor:pointer;min-height:44px;transition:all .3s;border:2px solid ' + gold + ';background:' + (s.sub === i ? gold : 'transparent') + ';color:' + (s.sub === i ? '#0E1B3D' : '#F2F5FB')
    }));

    const agData = [
      ['Cuaresma', 'Retiro Cuaresmal', 'Un espacio de oración y renovación de la vocación catequística.', 'Fecha por anunciar'],
      ['Formación', 'Semana de Catequesis', 'Jornadas de formación, celebración y encuentro para catequistas de la Arquidiócesis.', 'Fecha por anunciar'],
      ['Celebración', 'Día del Catequista', 'La Comisión celebra y agradece el servicio de los catequistas el tercer domingo de septiembre.', 'Tercer domingo de septiembre'],
      ['Por zonas', 'Encuentros zonales', 'Espacios de coordinación y acompañamiento entre zonas pastorales.', 'Fecha por anunciar'],
      ['En parroquias', 'Formaciones en parroquias', 'Talleres y charlas que acercan la formación a las comunidades.', 'Durante el año']
    ];
    const agenda = agData.map((d, i) => {
      const open = s.ag === i;
      return {
        type: d[0], title: d[1], detail: d[2], date: d[3], open,
        toggle: () => this.setState({ ag: open ? -1 : i }),
        plusStyle: 'display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#0E1B3D;color:#F2F5FB;font-size:22px;transition:transform .35s;transform:rotate(' + (open ? 135 : 0) + 'deg)',
        detailStyle: 'overflow:hidden;transition:max-height .45s ease,opacity .45s;max-height:' + (open ? '220px' : '0') + ';opacity:' + (open ? 1 : 0)
      };
    });

    const intData = ['Quiero empezar como catequista', 'Ya soy catequista', 'Coordino la catequesis de mi parroquia'];
    const intereses = intData.map((l, i) => ({
      label: l, active: s.interes === i,
      pick: () => this.setState({ interes: i, categorias: i === 1 ? this.state.categorias : [] }),
      style: 'padding:10px 16px;border-radius:99px;font:inherit;font-size:15px;font-weight:700;cursor:pointer;min-height:44px;border:2px solid #0E1B3D;background:' + (s.interes === i ? '#0E1B3D' : 'transparent') + ';color:' + (s.interes === i ? '#F2F5FB' : '#0E1B3D')
    }));
    const tiposCatequesis = ['Niños', 'Jóvenes', 'Adultos', 'Prebautismal', 'Especial', 'Familiar', 'Otra área'].map(label => ({
      label, active: s.categorias.includes(label),
      toggle: () => this.setState({ categorias: this.state.categorias.includes(label)
        ? this.state.categorias.filter(value => value !== label)
        : [...this.state.categorias, label] })
    }));

    const cardData = [
      ['Más que sacramentos', 'La catequesis es un camino de crecimiento y maduración en la fe. Integra la Palabra de Dios, la liturgia, la vida comunitaria, la oración y el compromiso cristiano.'],
      ['La familia primero', 'La familia es la primera escuela de fe. El catequista no reemplaza a los padres: camina con ellos y fortalece lo que ya se vive en casa.'],
      ['Palabra, fe y vida', 'Cada encuentro parte de la Palabra viva de Dios y desemboca en celebración, comunidad y testimonio en las parroquias de Panamá.']
    ];
    const cards = cardData.map((d, i) => {
      const revealed = s.rev > i; const avail = s.rev === i; const locked = s.rev < i;
      return {
        n: i + 1, title: d[0], locked,
        aria: locked ? 'Carta ' + (i + 1) + ' bloqueada. Descubre la anterior primero.' : (revealed ? 'Leer de nuevo: ' + d[0] : 'Descubrir la carta ' + (i + 1)),
        cls: avail ? 'card cta' : (revealed ? 'card' : ''),
        pick: () => this.setState({ open: i }),
        hint: locked ? 'Bloqueada. Descubre la anterior primero' : 'Toca para descubrir',
        hintStyle: 'font-size:15px;font-weight:700;padding:8px 16px;border-radius:99px;' + (locked ? 'color:#B9C4DC;border:1px dashed rgba(185,196,220,.6)' : 'background:#F0B544;color:#0E1B3D'),
        btnStyle: 'position:relative;height:300px;border:0;padding:0;background:none;border-radius:22px;perspective:1000px;font:inherit;color:inherit;cursor:' + (locked ? 'not-allowed' : 'pointer') + ';opacity:' + (locked ? 0.6 : 1),
        innerStyle: 'position:absolute;inset:0;display:block;transition:transform .8s cubic-bezier(.2,.7,.2,1);transform-style:preserve-3d;transform:rotateY(' + (revealed ? 180 : 0) + 'deg)'
      };
    });
    const mi = s.open;
    const modal = mi >= 0 ? { n: mi + 1, title: cardData[mi][0], body: cardData[mi][1], closeLabel: mi < 2 && s.rev <= mi ? 'Entendido, desbloquear la siguiente' : 'Cerrar' } : { n: 1, title: '', body: '', closeLabel: '' };

    const imgStyle = (on) => 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .7s ease,transform 1.1s ease;opacity:' + (on ? 1 : 0) + ';transform:scale(' + (on ? 1 : 1.08) + ')';

    const zoneData = [
      { short: 'San Francisco de Paula', color: '#4A8AC4', ink: '#0E1B3D', area: 'Panamá Oeste' },
      { short: 'Santa María la Antigua', color: '#55B167', ink: '#0E1B3D', area: 'Panamá Centro' },
      { short: 'Cristo Redentor', color: '#E13355', ink: '#FFFFFF', area: 'San Miguelito' },
      { short: 'Nuestra Señora del Carmen', color: '#F5AF3E', ink: '#0E1B3D', area: 'Panamá Este' }
    ];
    const zs = zoneData.map((d, i) => ({
      pick: () => this.setState({ zone: i }),
      style: 'cursor:pointer;stroke-linejoin:round;fill:#fff;fill-opacity:' + (s.zone === -1 || s.zone === i ? 0 : 0.66) + ';stroke:' + (s.zone === i ? '#0E1B3D' : 'rgba(255,255,255,0)') + ';stroke-width:' + (s.zone === i ? 6 : 0) + ';filter:' + (s.zone === i ? 'drop-shadow(0 0 10px rgba(14,27,61,.7))' : 'none')
    }));
    const zoneBtns = zoneData.map((d, i) => {
      const on = s.zone === i;
      return {
        n: i + 1, name: d.short, area: d.area, active: on,
        pick: () => this.setState({ zone: i }),
        style: 'display:flex;align-items:center;gap:14px;width:100%;padding:12px 16px;border-radius:16px;font:inherit;cursor:pointer;min-height:56px;transition:all .3s;border:2px solid ' + d.color + ';background:' + (on ? d.color : 'transparent') + ';color:' + (on ? d.ink : '#F2F5FB'),
        numStyle: 'width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;flex:none;background:' + (on ? '#0E1B3D' : '#F2F5FB') + ';color:' + (on ? '#F2F5FB' : '#0E1B3D')
      };
    });
    const zsel = s.zone >= 0 ? zoneData[s.zone] : null;
    const zc = zsel
      ? { eyebrow: 'Zona pastoral', name: zsel.short, color: zsel.color, area: zsel.area, description: 'La Comisión acompaña la labor catequética de las comunidades de esta zona en coordinación con las parroquias.' }
      : { eyebrow: 'Zonas pastorales', name: 'Elige una zona', color: '#F0B544', area: '', description: 'Toca una zona del mapa o de la lista para explorar esta referencia territorial.' };

    const hitoData = [
      ['Comunidad', 'Una misión compartida', 'La catequesis se vive en comunión con las parroquias y sus comunidades.'],
      ['Formación', 'Aprender para acompañar', 'La formación permanente fortalece el servicio de los catequistas.'],
      ['Encuentro', 'Caminar juntos', 'Los espacios de encuentro ayudan a compartir experiencias y renovar la vocación.'],
      ['Servicio', 'Fe que se comparte', 'Cada catequista aporta a la transmisión viva del Evangelio.']
    ];
    const hitoBtns = hitoData.map((d, i) => {
      const on = s.hito === i;
      return {
        tag: d[0], title: d[1], active: on,
        pick: () => this.setState({ hito: i }),
        style: 'display:flex;flex-direction:column;gap:6px;align-items:flex-start;text-align:left;width:100%;padding:18px 22px;border-radius:18px;font:inherit;cursor:pointer;min-height:56px;transition:all .3s;border:2px solid ' + gold + ';background:' + (on ? gold : 'transparent') + ';color:' + (on ? '#0E1B3D' : '#F2F5FB')
      };
    });
    const ht = { tag: hitoData[s.hito][0], title: hitoData[s.hito][1], text: hitoData[s.hito][2] };

    const dots = [];
    for (let i = 0; i < 14; i++) {
      const size = 4 + (i * 7) % 9;
      dots.push({ style: 'position:absolute;border-radius:50%;background:' + gold + ';width:' + size + 'px;height:' + size + 'px;left:' + ((i * 37 + 8) % 96) + '%;top:' + ((i * 53 + 12) % 88) + '%;animation-delay:-' + ((i * 1.3) % 7) + 's;animation-duration:' + (6 + (i % 5)) + 's' });
    }

    return {
      cards, modal, modalOpen: mi >= 0,
      closeCard: () => this.setState({ rev: Math.max(this.state.rev, this.state.open + 1), open: -1 }),
      stop: (e) => e.stopPropagation(),
      accent: gold, dots, steps, progress, cur: stepsData[s.step],
      words: ['Anunciar', 'Celebrar', 'Acompañar', 'Formar', 'Enviar', 'Servir'],
      services, subs, subText: subData[s.sub][1], agenda, intereses, isCatequista: s.interes === 1, tiposCatequesis,
      subTitle: 'Catequesis ' + subData[s.sub][0].toLowerCase(),
      subImg0: imgStyle(s.sub === 0), subImg1: imgStyle(s.sub === 1), subImg2: imgStyle(s.sub === 2), subImg3: imgStyle(s.sub === 3),
      z0: zs[0], z1: zs[1], z2: zs[2], z3: zs[3], zoneBtns, zc,
      hitoBtns, ht, hi0: imgStyle(s.hito === 0), hi1: imgStyle(s.hito === 1), hi2: imgStyle(s.hito === 2), hi3: imgStyle(s.hito === 3),
      nombre: s.nombre, parroquia: s.parroquia, contacto: s.contacto, mensaje: s.mensaje,
      setNombre: (e) => this.setState({ nombre: e.target.value }),
      setParroquia: (e) => this.setState({ parroquia: e.target.value }),
      setContacto: (e) => this.setState({ contacto: e.target.value }),
      setMensaje: (e) => this.setState({ mensaje: e.target.value }),
      sent: s.sent, notSent: !s.sent,
      submit: (e) => { e.preventDefault(); this.setState({ sent: true }); },
      reset: () => this.setState({ sent: false, interes: 0, categorias: [], nombre: '', parroquia: '', contacto: '', mensaje: '' })
    };
  }
}
return Component;
};
