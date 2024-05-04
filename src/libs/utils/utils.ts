export class StateEnum {
    static Created = new StateEnum('created')
    static Instantiated = new StateEnum('instantiated')
    static Running = new StateEnum('running')
    static Stopped = new StateEnum('stopped')

    _name:string

    constructor( name:string ) {
        this._name = name
    }
}