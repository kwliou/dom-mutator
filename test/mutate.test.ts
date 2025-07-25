import mutate, {
  disconnectGlobalObserver,
  connectGlobalObserver,
  DeclarativeMutation,
  MutationController,
} from '../src';

function sleep(ms = 20) {
  return new Promise(res => setTimeout(res, ms));
}

let _cleanup: (() => void)[] = [];
function cleanup(controller: MutationController) {
  _cleanup.push(controller.revert);
}
function revertAll() {
  // Revert the mutations in reverse order
  for (let i = _cleanup.length - 1; i >= 0; i--) {
    _cleanup[i]();
  }
  _cleanup = [];
}

describe('mutate', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    revertAll();
  });

  it('mutates existing elements and reverts', async () => {
    const initial = '<h1>title</h1><p class="text green">wor</p>';
    document.body.innerHTML = initial;

    cleanup(mutate.html('h1', () => 'hello'));
    await sleep();
    expect(document.body.innerHTML).toEqual(
      '<h1>hello</h1><p class="text green">wor</p>'
    );

    cleanup(mutate.classes('h1', c => c.add('title')));
    await sleep();
    expect(document.body.innerHTML).toEqual(
      '<h1 class="title">hello</h1><p class="text green">wor</p>'
    );

    cleanup(mutate.classes('.text', c => c.delete('green')));
    await sleep();
    expect(document.body.innerHTML).toEqual(
      '<h1 class="title">hello</h1><p class="text">wor</p>'
    );

    cleanup(mutate.html('.text', val => val + 'ld!'));
    await sleep();
    expect(document.body.innerHTML).toEqual(
      '<h1 class="title">hello</h1><p class="text">world!</p>'
    );

    cleanup(mutate.attribute('h1.title', 'title', () => 'title'));
    await sleep();
    expect(document.body.innerHTML).toEqual(
      '<h1 class="title" title="title">hello</h1><p class="text">world!</p>'
    );

    cleanup(mutate.classes('h1', c => c.add('another')));
    await sleep();
    expect(document.body.innerHTML).toEqual(
      '<h1 class="title another" title="title">hello</h1><p class="text">world!</p>'
    );

    revertAll();
    await sleep();
    expect(document.body.innerHTML).toEqual(initial);
  });

  it('moves elements - appending', async () => {
    const initial = '<div><h1>Hello</h1></div><div class="new-parent"></div>';
    document.body.innerHTML = initial;

    cleanup(mutate.position('h1', () => ({ parentSelector: '.new-parent' })));
    await sleep();
    expect(document.body.innerHTML).toEqual(
      '<div></div><div class="new-parent"><h1>Hello</h1></div>'
    );

    revertAll();
    await sleep();
    expect(document.body.innerHTML).toEqual(initial);
  });

  it('moves elements - inserting between', async () => {
    const initial =
      '<div><h1>Hello</h1></div><div class="new-parent"><div class="before-me"></div></div>';
    document.body.innerHTML = initial;

    cleanup(
      mutate.position('h1', () => ({
        parentSelector: '.new-parent',
        insertBeforeSelector: '.before-me',
      }))
    );
    await sleep();
    expect(document.body.innerHTML).toEqual(
      '<div></div><div class="new-parent"><h1>Hello</h1><div class="before-me"></div></div>'
    );

    revertAll();
    await sleep();
    expect(document.body.innerHTML).toEqual(initial);
  });

  it("moves elements - if the target elements don't exist we don't do anything (and don't blow up)", async () => {
    const initial = '<div><h1>Hello</h1></div><div class="new-parent"></div>';
    document.body.innerHTML = initial;

    cleanup(
      mutate.position('h1', () => ({
        parentSelector: '.new-parent',
        insertBeforeSelector: '.before-me',
      }))
    );
    await sleep();
    expect(document.body.innerHTML).toEqual(initial);

    const beforeMe = document.createElement('div');
    beforeMe.classList.add('before-me');
    document.querySelector('.new-parent')!.appendChild(beforeMe);

    await sleep();
    expect(document.body.innerHTML).toEqual(
      '<div><h1>Hello</h1></div><div class="new-parent"><div class="before-me"></div></div>'
    );

    revertAll();
    await sleep();
    expect(document.body.innerHTML).toEqual(
      '<div><h1>Hello</h1></div><div class="new-parent"><div class="before-me"></div></div>'
    );
  });

  it.skip('reapplies changes quickly when mutation occurs', async () => {
    document.body.innerHTML = '<p>original</p>';
    const el = document.querySelector('p');
    if (!el) return;
    cleanup(mutate.html('p', () => 'new'));
    await sleep();

    expect(el.innerHTML).toEqual('new');
    el.innerHTML = 'original';
    await sleep();
    expect(el.innerHTML).toEqual('new');
  });

  it.skip('reverts correctly after reapplying changes', async () => {
    document.body.innerHTML = '<p>original</p>';
    const el = document.querySelector('p');
    if (!el) return;
    cleanup(mutate.html('p', () => 'new'));
    await sleep();
    expect(el.innerHTML).toEqual('new');

    el.innerHTML = 'new normal';
    await sleep();
    expect(el.innerHTML).toEqual('new');

    revertAll();
    await sleep();
    expect(el.innerHTML).toEqual('new normal');
  });

  it('waits for elements to appear', async () => {
    document.body.innerHTML = '<div></div>';

    cleanup(mutate.html('p', () => 'bar'));
    await sleep();
    expect(document.body.innerHTML).toEqual('<div></div>');

    const hello = document.createElement('h1');
    hello.innerHTML = 'hello';
    document.querySelector('div')?.appendChild(hello);
    await sleep();

    const foo = document.createElement('p');
    foo.innerHTML = 'foo';
    document.querySelector('div')?.appendChild(foo);
    expect(document.body.innerHTML).toEqual(
      '<div><h1>hello</h1><p>foo</p></div>'
    );

    await sleep();
    expect(document.body.innerHTML).toEqual(
      '<div><h1>hello</h1><p>bar</p></div>'
    );
  });

  it('reverts existing attributes correctly', async () => {
    document.body.innerHTML = '<p title="foo"></p>';
    cleanup(mutate.attribute('p', 'title', () => 'bar'));
    await sleep();
    expect(document.body.innerHTML).toEqual('<p title="bar"></p>');
    revertAll();
    await sleep();
    expect(document.body.innerHTML).toEqual('<p title="foo"></p>');
  });

  it.skip('reapplies on top of existing values', async () => {
    document.body.innerHTML = '<h1>hello</h1>';
    cleanup(mutate.html('h1', val => val.toUpperCase()));
    await sleep();
    expect(document.body.innerHTML).toEqual('<h1>HELLO</h1>');
    const el = document.querySelector('h1');
    if (!el) return;
    el.innerHTML = 'world';
    await sleep();
    expect(document.body.innerHTML).toEqual('<h1>WORLD</h1>');
  });

  it('ignores duplicate values', async () => {
    document.body.innerHTML =
      '<h1 title="foo"></h1><p class="test">hello world</p>';
    const el = document.querySelector('p');
    if (!el) return;

    cleanup(mutate.classes('p', c => c.add('test')));
    await sleep();
    expect(el.className).toEqual('test');

    cleanup(mutate.classes('p', c => c.delete('foo')));
    await sleep();
    expect(el.className).toEqual('test');

    cleanup(mutate.html('p', () => 'hello world'));
    await sleep();
    expect(el.innerHTML).toEqual('hello world');

    cleanup(mutate.attribute('h1', 'title', () => 'foo'));
    await sleep();
    expect(document.body.innerHTML).toEqual(
      '<h1 title="foo"></h1><p class="test">hello world</p>'
    );
  });

  it('can disconnect the global observer', async () => {
    cleanup(mutate.html('h1', () => 'bar'));
    await sleep();
    disconnectGlobalObserver();
    document.body.innerHTML = '<h1>foo</h1>';
    await sleep();
    expect(document.body.innerHTML).toEqual('<h1>foo</h1>');
    connectGlobalObserver();
    await sleep();
    expect(document.body.innerHTML).toEqual('<h1>bar</h1>');
  });

  it('cancels pending waitingToApply mutations when reverted', async () => {
    cleanup(mutate.html('h1', () => 'bar'));
    await sleep();
    revertAll();
    document.body.innerHTML = '<h1>foo</h1>';
    await sleep();
    expect(document.body.innerHTML).toEqual('<h1>foo</h1>');
  });

  it('ignores invalid setAttribute value', async () => {
    document.body.innerHTML = '<h1>foo</h1>';
    cleanup(mutate.attribute('h1', '123', () => 'blah'));
    await sleep();
    expect(document.body.innerHTML).toEqual('<h1>foo</h1>');
  });

  it('skips checking if global MutationObserver has not added nodes', async () => {
    document.body.innerHTML = '<p>foo</p>';
    const el = document.querySelector('p');
    if (!el) return;
    cleanup(mutate.html('h1', () => 'foo'));
    await sleep();

    el.remove();
    await sleep();
    expect(document.body.innerHTML).toEqual('');
  });

  it.skip('handles appending invalid html', async () => {
    document.body.innerHTML = '<div></div>';
    const el = document.querySelector('div');
    if (!el) return;
    cleanup(mutate.html('div', val => val + '<b>foo'));
    await sleep();

    // Force mutation observer to fire for the element
    el.innerHTML = 'bar';
    await sleep();
    expect(el.innerHTML).toEqual('bar<b>foo</b>');
    revertAll();
  });

  it('handles conflicting mutations', async () => {
    document.body.innerHTML = '<div></div>';
    cleanup(mutate.html('div', () => 'foo'));
    const revert2 = mutate.html('div', () => 'bar');
    await sleep();
    expect(document.body.innerHTML).toEqual('<div>bar</div>');
    revert2.revert();
    await sleep();
    expect(document.body.innerHTML).toEqual('<div>foo</div>');
    revertAll();
    await sleep();
    expect(document.body.innerHTML).toEqual('<div></div>');
  });

  it('handles multiple mutations for the same element', async () => {
    document.body.innerHTML = '<div class="foo"></div>';
    cleanup(mutate.classes('div', c => c.add('bar')));
    cleanup(mutate.attribute('div', 'class', () => 'baz'));
    cleanup(mutate.classes('div', c => c.add('last')));
    await sleep();

    expect(document.body.innerHTML).toEqual('<div class="baz last"></div>');
  });

  it('supports multiple matching elements', async () => {
    const div1 = document.createElement('div');
    const div2 = document.createElement('div');

    document.body.appendChild(div1);
    document.body.appendChild(div2);

    cleanup(mutate.classes('div', c => c.add('foo')));
    await sleep();
    expect(div1.className).toEqual('foo');
    expect(div2.className).toEqual('foo');

    const div3 = document.createElement('div');
    document.body.appendChild(div3);
    await sleep();
    expect(div3.className).toEqual('foo');

    div2.remove();
  });

  it('handles empty setAttribute value', async () => {
    document.body.innerHTML = '<div title="foo"></div>';
    cleanup(mutate.attribute('div', 'title', () => ''));
    await sleep();
    expect(document.body.innerHTML).toEqual('<div title=""></div>');
  });

  it('removes attributes when set to null', async () => {
    document.body.innerHTML = '<div title="foo"></div>';
    cleanup(mutate.attribute('div', 'title', () => null));
    await sleep();
    expect(document.body.innerHTML).toEqual('<div></div>');
  });

  it('picks up characterData changes when mutating html', async () => {
    const div = document.createElement('div');
    const text = document.createTextNode('foo');
    div.append(text);
    document.body.append(div);

    cleanup(mutate.html('div', () => 'bar'));
    await sleep();
    text.nodeValue = 'baz';
    await sleep();
    expect(div.innerHTML).toEqual('bar');
  });

  it.skip('picks up on child attribute changes when mutating html', async () => {
    document.body.innerHTML = '<div>foo</div>';
    cleanup(mutate.html('div', () => '<p>bar</p>'));
    await sleep();
    expect(document.body.innerHTML).toEqual('<div><p>bar</p></div>');
    const p = document.querySelector('p');
    p && (p.title = 'foo');
    await sleep();
    expect(document.body.innerHTML).toEqual('<div><p>bar</p></div>');
  });

  it('can revert and mutate the same element quickly', async () => {
    document.body.innerHTML = '<div>foo</div>';
    const revert = mutate.classes('div', c => c.add('hello'));
    await sleep();
    expect(document.body.innerHTML).toEqual('<div class="hello">foo</div>');
    revert.revert();
    cleanup(mutate.classes('div', c => c.add('hello')));
    await sleep();
    expect(document.body.innerHTML).toEqual('<div class="hello">foo</div>');
  });

  it('can do declarative mutations', async () => {
    const initial =
      '<div class="main"><h1>title</h1><p class="text green">wor</p></div><div class="smiley-face">:)</div>';
    document.body.innerHTML = initial;

    const mutations: DeclarativeMutation[] = [
      {
        selector: 'h1',
        action: 'set',
        attribute: 'html',
        value: 'hello',
      },
      {
        selector: 'h1',
        action: 'append',
        attribute: 'class',
        value: 'title',
      },
      {
        selector: '.text',
        action: 'remove',
        attribute: 'class',
        value: 'green',
      },
      {
        selector: '.text',
        action: 'append',
        attribute: 'html',
        value: 'ld!',
      },
      {
        selector: 'h1.title',
        action: 'set',
        attribute: 'title',
        value: 'title',
      },
      {
        selector: 'h1.title',
        action: 'append',
        attribute: 'data-growthbook',
        value: '',
      },
      {
        selector: 'h1',
        action: 'append',
        attribute: 'class',
        value: 'another',
      },
      {
        selector: '.smiley-face',
        action: 'set',
        attribute: 'position',
        parentSelector: '.main',
      },
    ];

    mutations.forEach(m => {
      cleanup(mutate.declarative(m));
    });
    // Need to wait for 2 request animation frames since some of the mutations depend on previous ones
    await sleep();
    await sleep();

    expect(document.body.innerHTML).toEqual(
      '<div class="main"><h1 class="title another" title="title" data-growthbook="">hello</h1><p class="text">world!</p><div class="smiley-face">:)</div></div>'
    );

    revertAll();
    await sleep();
    expect(document.body.innerHTML).toEqual(initial);
  });

  it('can revert multiple repositioning on the same element', async () => {
    const initial =
      '<div class="main">' +
      '<div class="foo"><div class="bar">1</div></div>' +
      '<div class="foo"><div class="bar">2</div></div>' +
      '<div class="foo"><div class="bar">3</div></div>' +
      '</div>';
    document.body.innerHTML = initial;

    const m1: DeclarativeMutation = {
      selector: '.foo:nth-child(1)',
      action: 'set',
      attribute: 'position',
      parentSelector: '.foo:nth-child(2)',
      insertBeforeSelector: '.foo:nth-child(2) .bar',
    };

    cleanup(mutate.declarative(m1));
    await sleep();

    expect(document.body.innerHTML).toEqual(
      '<div class="main">' +
        '<div class="foo"><div class="foo"><div class="bar">1</div></div><div class="bar">2</div></div>' +
        '<div class="foo"><div class="bar">3</div></div>' +
        '</div>'
    );

    const m2: DeclarativeMutation = {
      selector: '.foo > .foo',
      action: 'set',
      attribute: 'position',
      parentSelector: '.main',
      insertBeforeSelector: '.foo:nth-child(2)',
    };

    const contr2 = mutate.declarative(m2);
    cleanup(contr2);
    await sleep();

    expect(document.body.innerHTML).toEqual(
      '<div class="main">' +
        '<div class="foo"><div class="bar">2</div></div>' +
        '<div class="foo"><div class="bar">1</div></div>' +
        '<div class="foo"><div class="bar">3</div></div>' +
        '</div>'
    );

    contr2.revert();
    await sleep();

    expect(document.body.innerHTML).toEqual(
      '<div class="main">' +
        '<div class="foo"><div class="foo"><div class="bar">1</div></div><div class="bar">2</div></div>' +
        '<div class="foo"><div class="bar">3</div></div>' +
        '</div>'
    );
  });

  it('can revert mutations out of order', async () => {
    const initial =
      '<div class="main">' +
      '<div class="foo"><div class="bar">1</div></div>' +
      '<div class="foo"><div class="bar">2</div></div>' +
      '<div class="foo"><div class="bar">3</div></div>' +
      '</div>';
    document.body.innerHTML = initial;

    const m1: DeclarativeMutation = {
      selector: '.foo:nth-child(1)',
      action: 'set',
      attribute: 'position',
      parentSelector: '.foo:nth-child(2)',
      insertBeforeSelector: '.foo:nth-child(2) .bar',
    };

    const contr1 = mutate.declarative(m1);
    cleanup(contr1);
    await sleep();

    expect(document.body.innerHTML).toEqual(
      '<div class="main">' +
        '<div class="foo"><div class="foo"><div class="bar">1</div></div><div class="bar">2</div></div>' +
        '<div class="foo"><div class="bar">3</div></div>' +
        '</div>'
    );

    const m2: DeclarativeMutation = {
      selector: '.foo > .foo',
      action: 'set',
      attribute: 'position',
      parentSelector: '.main',
      insertBeforeSelector: '.foo:nth-child(2)',
    };

    cleanup(mutate.declarative(m2));
    await sleep();

    expect(document.body.innerHTML).toEqual(
      '<div class="main">' +
        '<div class="foo"><div class="bar">2</div></div>' +
        '<div class="foo"><div class="bar">1</div></div>' +
        '<div class="foo"><div class="bar">3</div></div>' +
        '</div>'
    );

    const m3: DeclarativeMutation = {
      selector: '.foo:nth-child(3) .bar',
      action: 'set',
      attribute: 'position',
      parentSelector: '.main',
      insertBeforeSelector: '.foo:nth-child(1)',
    };

    cleanup(mutate.declarative(m3));
    await sleep();

    expect(document.body.innerHTML).toEqual(
      '<div class="main">' +
        '<div class="bar">3</div>' +
        '<div class="foo"><div class="bar">2</div></div>' +
        '<div class="foo"><div class="bar">1</div></div>' +
        '<div class="foo"></div>' +
        '</div>'
    );

    contr1.revert();
    await sleep();

    // we expect no change because that same element is still being moved by m2
    expect(document.body.innerHTML).toEqual(
      '<div class="main">' +
        '<div class="bar">3</div>' +
        '<div class="foo"><div class="bar">2</div></div>' +
        '<div class="foo"><div class="bar">1</div></div>' +
        '<div class="foo"></div></div>'
    );
  });

  it('can handle identical mutations', async () => {
    const initial =
      '<div class="main">' +
      '<div class="foo">1</div>' +
      '<div class="foo">2</div>' +
      '<div class="foo">3</div>' +
      '</div>';
    document.body.innerHTML = initial;

    const m1: DeclarativeMutation = {
      selector: '.main > .foo:nth-child(1)',
      action: 'set',
      attribute: 'position',
      parentSelector: '.main > .foo:nth-child(2)',
    };

    cleanup(mutate.declarative(m1));
    await sleep();

    expect(document.body.innerHTML).toEqual(
      '<div class="main">' +
        '<div class="foo">2<div class="foo">1</div></div>' +
        '<div class="foo">3</div>' +
        '</div>'
    );

    cleanup(mutate.declarative(m1));
    await sleep();

    expect(document.body.innerHTML).toEqual(
      '<div class="main">' +
        '<div class="foo">3' +
        '<div class="foo">2<div class="foo">1</div></div>' +
        '</div></div>'
    );
  });

  it('can revert dependent mutations out of order', async () => {
    const initial =
      '<div class="main">' +
      '<div class="foo"><div class="bar">1</div></div>' +
      '<div class="foo"><div class="bar">2</div></div>' +
      '<div class="foo"><div class="bar">3</div></div>' +
      '</div>';
    document.body.innerHTML = initial;

    const m1: DeclarativeMutation = {
      selector: '.main > .foo:nth-child(1)',
      action: 'set',
      attribute: 'position',
      parentSelector: 'body',
      insertBeforeSelector: '.main',
    };

    const contr1 = mutate.declarative(m1);
    cleanup(contr1);
    await sleep();

    expect(document.body.innerHTML).toEqual(
      '<div class="foo"><div class="bar">1</div></div>' +
        '<div class="main">' +
        '<div class="foo"><div class="bar">2</div></div>' +
        '<div class="foo"><div class="bar">3</div></div>' +
        '</div>'
    );

    const m2: DeclarativeMutation = {
      selector: '.main > .foo:nth-child(1)',
      action: 'set',
      attribute: 'position',
      parentSelector: '.main',
    };

    const contr2 = mutate.declarative(m2);
    cleanup(contr2);
    await sleep();

    expect(document.body.innerHTML).toEqual(
      '<div class="foo"><div class="bar">1</div></div>' +
        '<div class="main">' +
        '<div class="foo"><div class="bar">3</div></div>' +
        '<div class="foo"><div class="bar">2</div></div>' +
        '</div>'
    );

    contr1.revert();
    await sleep();

    expect(document.body.innerHTML).toEqual(
      '<div class="main">' +
        '<div class="foo"><div class="bar">1</div></div>' +
        '<div class="foo"><div class="bar">3</div></div>' +
        '<div class="foo"><div class="bar">2</div></div>' +
        '</div>'
    );
  });
});
